export function renderHTML(report) {
  const { costAnalysis, cacheHealth, anomalies, inflection, sessionIntel, modelRouting, projectBreakdown, claudeMdStack, oauthUsage, recommendations, generatedAt } = report;

  const dailyCosts = costAnalysis.dailyCosts || [];
  const grade = cacheHealth.grade || { letter: '?', color: '#666', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;
  const activeDays = costAnalysis.activeDays || 0;
  const peakDay = costAnalysis.peakDay;

  const modelCosts = costAnalysis.modelCosts || {};
  const modelEntries = Object.entries(modelCosts).filter(([, c]) => c > 0.01).sort((a, b) => b[1] - a[1]);
  const anomalyDates = new Set((anomalies.anomalies || []).map(a => a.date));

  const dailyCostsJSON = JSON.stringify(dailyCosts.map(d => ({
    date: d.date, cost: d.cost, cacheOutputRatio: d.cacheOutputRatio || 0, isAnomaly: anomalyDates.has(d.date),
  })));

  const projectsJSON = JSON.stringify((projectBreakdown || []).slice(0, 15).map(p => ({
    name: p.name, path: p.path, messages: p.messageCount, sessions: p.sessionCount,
    input: p.inputTokens, output: p.outputTokens, cacheRead: p.cacheReadTokens, cacheWrite: p.cacheCreationTokens,
  })));

  const fmtCost = (n) => '$' + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));

  // Grade color mapping to Stitch palette
  const gradeColorMap = {
    'A': '#c0c1ff',   // primary indigo
    'B': '#d4bbff',   // tertiary purple
    'C': '#ffb690',   // secondary orange
    'D': '#ffb4ab',   // error red
    'F': '#ffb4ab',   // error red
  };
  const gradeColor = gradeColorMap[grade.letter] || '#908fa0';

  // Grade label mapping
  const gradeLabelMap = {
    'A': 'Excellent Performance',
    'B': 'Good Performance',
    'C': 'Fair Performance',
    'D': 'Poor Performance',
    'F': 'Critical Performance',
  };
  const gradeLabel = gradeLabelMap[grade.letter] || grade.label || 'Unknown';

  // Diagnosis one-liner for the share card
  const diagnosisLine = inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2
    ? `Efficiency dropped ${inflection.multiplier}x on ${inflection.date}`
    : anomalies.hasAnomalies
    ? `${anomalies.anomalies.length} anomal${anomalies.anomalies.length === 1 ? 'y' : 'ies'} detected`
    : grade.letter === 'A' ? 'System running clean'
    : grade.letter === 'B' ? 'Minor optimization opportunities'
    : `Cache efficiency needs attention`;

  // Model colors from Stitch palette
  const modelColors = ['#c0c1ff', '#d4bbff', '#ffb690', '#8083ff', '#a775ff', '#ffb4ab'];

  // Severity to Stitch color mapping
  const sevColorMap = {
    critical: { border: '#ffb4ab', bg: 'rgba(255, 180, 171, 0.10)', text: '#ffb4ab' },
    warning:  { border: '#ffb690', bg: 'rgba(255, 182, 144, 0.10)', text: '#ffb690' },
    info:     { border: '#c0c1ff', bg: 'rgba(192, 193, 255, 0.10)', text: '#c0c1ff' },
    positive: { border: '#c0c1ff', bg: 'rgba(192, 193, 255, 0.10)', text: '#c0c1ff' },
  };

  return `<!DOCTYPE html>
<html class="dark" lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CC Hubber</title>
<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet">
<script>
  tailwind.config = {
    darkMode: "class",
    theme: {
      extend: {
        colors: {
          "background": "#121315",
          "surface": "#121315",
          "surface-dim": "#121315",
          "surface-container-lowest": "#0d0e0f",
          "surface-container-low": "#1b1c1d",
          "surface-container": "#1f2021",
          "surface-container-high": "#292a2b",
          "surface-container-highest": "#343536",
          "surface-bright": "#38393a",
          "on-surface": "#e3e2e3",
          "on-surface-variant": "#c7c4d7",
          "on-background": "#e3e2e3",
          "outline": "#908fa0",
          "outline-variant": "#464554",
          "primary": "#c0c1ff",
          "primary-container": "#8083ff",
          "on-primary": "#1000a9",
          "secondary": "#ffb690",
          "secondary-container": "#ec6a06",
          "on-secondary": "#552100",
          "tertiary": "#d4bbff",
          "tertiary-container": "#a775ff",
          "error": "#ffb4ab",
          "error-container": "#93000a",
          "on-error": "#690005",
          "inverse-surface": "#e3e2e3",
          "inverse-on-surface": "#303032",
          "inverse-primary": "#494bd6",
          "surface-tint": "#c0c1ff",
        },
        fontFamily: {
          "headline": ["Inter", "system-ui", "sans-serif"],
          "body": ["Inter", "system-ui", "sans-serif"],
          "label": ["Inter", "system-ui", "sans-serif"],
          "mono": ["JetBrains Mono", "monospace"],
        },
        borderRadius: {
          "DEFAULT": "0.125rem",
          "lg": "0.25rem",
          "xl": "0.5rem",
          "full": "0.75rem",
        },
      },
    },
  }
</script>
<style>
  body {
    background-color: #121315;
    color: #e3e2e3;
    font-family: 'Inter', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  .font-mono { font-family: 'JetBrains Mono', monospace !important; }

  /* Tooltip */
  .tt {
    position: fixed;
    background: rgba(31, 32, 33, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(70, 69, 84, 0.3);
    border-radius: 0.5rem;
    padding: 10px 14px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 100;
    white-space: nowrap;
  }
  .tt.on { opacity: 1; }

  /* Toast */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(60px);
    background: #292a2b;
    border: 1px solid rgba(70, 69, 84, 0.3);
    border-radius: 0.5rem;
    padding: 10px 20px;
    font-size: 12px;
    font-weight: 600;
    color: #e3e2e3;
    opacity: 0;
    transition: all 0.25s;
    z-index: 200;
    pointer-events: none;
  }
  .toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }

  /* SVG chart */
  #cost-chart-svg { width: 100%; overflow: visible; display: block; }

  /* Table hover */
  .tbl-row:hover { background: #292a2b; }
  .tbl-row { transition: background 0.15s; }
</style>
</head>
<body class="selection:bg-primary selection:text-on-primary">

<div class="tt" id="tt">
  <div class="font-mono text-[11px] text-[#908fa0] mb-1" id="tt-d"></div>
  <div class="font-mono text-[15px] font-bold text-[#e3e2e3]" id="tt-c"></div>
  <div class="text-[10px] text-[#ffb4ab] mt-1" id="tt-a"></div>
</div>
<div class="toast" id="toast"></div>

<!-- 1. HEADER -->
<header class="w-full px-6 py-5 max-w-[1200px] mx-auto flex justify-between items-baseline">
  <div class="flex items-baseline gap-4">
    <span class="text-lg font-bold tracking-tight text-[#e3e2e3]">CC Hubber</span>
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0]">shipped fast with Mover OS</span>
  </div>
  <span class="font-mono text-[11px] text-[#908fa0]" id="range-lbl">All time</span>
</header>

<main class="pb-20 px-6 max-w-[1200px] mx-auto space-y-12">

<!-- 2. SHARE CARD -->
<section>
  <div id="share-card" class="p-8 md:p-10 bg-[#1b1c1d] rounded-xl border border-[rgba(70,69,84,0.15)] relative overflow-hidden">

    <!-- Top row: Grade + Label + Stats -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
      <div class="flex items-center gap-6">
        <div class="w-20 h-20 flex items-center justify-center rounded-xl" style="background:${gradeColor}">
          <span class="font-black text-4xl" style="color:#121315">${grade.letter}</span>
        </div>
        <div>
          <span class="text-[10px] font-mono uppercase tracking-[0.05em] block mb-1" style="color:${gradeColor}">Efficiency Rating</span>
          <h2 class="text-2xl md:text-3xl font-black text-[#e3e2e3]">${gradeLabel}</h2>
        </div>
      </div>
      <div class="flex gap-8 md:gap-12 flex-wrap">
        <div>
          <p class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] mb-1">Total Spend</p>
          <p class="font-mono text-2xl md:text-3xl font-bold text-[#e3e2e3]" id="h-cost">${fmtCost(totalCost)}</p>
        </div>
        <div class="border-l border-[rgba(70,69,84,0.3)] pl-8 md:pl-12">
          <p class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] mb-1">Active Days</p>
          <p class="font-mono text-2xl md:text-3xl font-bold text-[#e3e2e3]" id="h-days">${activeDays}</p>
        </div>
        <div class="border-l border-[rgba(70,69,84,0.3)] pl-8 md:pl-12">
          <p class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] mb-1">Cache Ratio</p>
          <p class="font-mono text-2xl md:text-3xl font-bold text-[#e3e2e3]">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}</p>
        </div>
      </div>
    </div>

    <!-- Diagnosis divider -->
    <div class="mt-8 pt-6 border-t border-[rgba(70,69,84,0.15)] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <p class="text-sm text-[#c7c4d7]">${diagnosisLine}</p>
      <div class="flex items-center gap-4">
        <span class="text-[10px] font-mono uppercase tracking-[0.05em] text-[#908fa0]">CC Hubber</span>
        <span class="text-[10px] uppercase tracking-[0.05em] text-[#464554]">shipped fast with Mover OS</span>
      </div>
    </div>
  </div>

  <!-- Export button -->
  <div class="flex justify-center mt-4">
    <button id="btn-png" class="px-5 py-2.5 border border-[rgba(70,69,84,0.3)] rounded-xl text-sm font-semibold text-[#908fa0] hover:bg-[#292a2b] hover:text-[#e3e2e3] transition-colors flex items-center gap-2 cursor-pointer">
      <span class="material-symbols-outlined text-sm">download</span>
      Save as GIF
    </button>
  </div>
</section>

${oauthUsage ? renderRateLimits(oauthUsage) : ''}

${inflection && inflection.multiplier >= 1.5 ? `
<!-- Inflection callout -->
<section class="p-6 bg-[#0d0e0f] border-l-4 border-[#ffb690] rounded-r-xl">
  <p class="text-xs font-bold text-[#ffb690] uppercase tracking-[0.05em] mb-1">Inflection Point</p>
  <p class="text-sm text-[#c7c4d7]">${inflection.summary}</p>
</section>
` : ''}

<!-- 3. METRIC GRID -->
<section class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 rounded-xl overflow-hidden border border-[rgba(70,69,84,0.15)]" style="gap:1px; background:rgba(70,69,84,0.15);">
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Total Cost</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]" id="ov-total">${fmtCost(totalCost)}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono" id="ov-avg">${fmtCost(costAnalysis.avgDailyCost || 0)} avg/day</span>
  </div>
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Peak Day</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]">${peakDay ? fmtCost(peakDay.cost) : '$0'}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono">${peakDay ? peakDay.date : ''}</span>
  </div>
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Cache Health</span>
    <span class="font-mono text-2xl font-bold block" style="color:${gradeColor}">${grade.letter}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : ''}</span>
  </div>
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Cache Breaks</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]">${cacheHealth.totalCacheBreaks || 0}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block">${cacheHealth.reasonsRanked?.[0]?.reason || 'None detected'}</span>
  </div>
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">CLAUDE.md</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]">~${Math.round(claudeMdStack.totalTokensEstimate / 1000)}K</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono">${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB</span>
  </div>
  ${sessionIntel?.available ? `
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Sessions</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]">${sessionIntel.totalSessions}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono">${sessionIntel.avgDuration} min avg</span>
  </div>` : `
  <div class="p-6 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Sessions</span>
    <span class="font-mono text-2xl font-bold block text-[#e3e2e3]">${costAnalysis.sessions?.total || 0}</span>
    <span class="text-[10px] text-[#908fa0] mt-1 block font-mono">${costAnalysis.sessions?.avgDurationMinutes ? Math.round(costAnalysis.sessions.avgDurationMinutes) + ' min avg' : ''}</span>
  </div>`}
</section>

<!-- 4. COST TREND CHART -->
<section class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
  <div class="flex justify-between items-end mb-10">
    <div>
      <h3 class="text-xl font-bold text-[#e3e2e3] mb-1">Cost Trend</h3>
      <p class="text-sm text-[#908fa0]" id="chart-info"></p>
    </div>
    <div class="flex gap-1 p-1 bg-[#0d0e0f] rounded-xl border border-[rgba(70,69,84,0.15)]" id="filters">
      <button class="cfilt px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg text-[#908fa0] hover:text-[#e3e2e3] transition-colors" data-r="7">7d</button>
      <button class="cfilt px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg text-[#908fa0] hover:text-[#e3e2e3] transition-colors" data-r="30">30d</button>
      <button class="cfilt px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg text-[#908fa0] hover:text-[#e3e2e3] transition-colors" data-r="90">90d</button>
      <button class="cfilt px-3 py-1.5 text-[10px] font-bold uppercase rounded-lg bg-[#c0c1ff] text-[#1000a9] transition-colors" data-r="all">All</button>
    </div>
  </div>
  <svg id="cost-chart-svg" viewBox="0 0 900 200" preserveAspectRatio="xMidYMid meet"></svg>
</section>

<!-- 5. SESSION INTELLIGENCE + MODEL DISTRIBUTION -->
<section class="grid grid-cols-1 lg:grid-cols-2 gap-8">

  <!-- Session Intelligence -->
  <div class="space-y-8">
    ${sessionIntel?.available ? `
    <div class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
      <h3 class="text-xl font-bold text-[#e3e2e3] mb-6">Session Intelligence</h3>
      <div class="grid grid-cols-3 gap-6 mb-8">
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">Median</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.medianDuration}m</span>
        </div>
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">P90</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.p90Duration}m</span>
        </div>
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">Longest</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.maxDuration}m</span>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-6 mb-8">
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">Long Sessions</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.longSessions}</span>
          <span class="text-[10px] text-[#908fa0] block font-mono">${sessionIntel.longSessionPct}% over 60m</span>
        </div>
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">Tools/Session</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.avgToolsPerSession}</span>
        </div>
        <div>
          <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-1">Lines/Hour</span>
          <span class="font-mono text-xl font-bold text-[#e3e2e3]">${sessionIntel.linesPerHour.toLocaleString()}</span>
        </div>
      </div>

      ${sessionIntel.topTools.length > 0 ? `
      <div>
        <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-4">Top Tools Usage</span>
        <div class="space-y-3">
          ${sessionIntel.topTools.slice(0, 6).map((t, i) => `
          <div class="space-y-1">
            <div class="flex justify-between text-[11px] font-mono">
              <span class="text-[#c7c4d7]">${t.name}</span>
              <span class="text-[#908fa0]">${t.count}</span>
            </div>
            <div class="h-1.5 bg-[#343536] rounded-full overflow-hidden">
              <div class="h-full rounded-full" style="width:${sessionIntel.topTools[0].count > 0 ? (t.count / sessionIntel.topTools[0].count * 100) : 0}%;background:${i === 0 ? '#c0c1ff' : '#d4bbff'}"></div>
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}
    </div>` : ''}

    <!-- 6. ACTIVITY HEATMAP -->
    ${sessionIntel?.hourDistribution ? `
    <div class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
      <h3 class="text-lg font-bold text-[#e3e2e3] mb-4">Activity by Hour</h3>
      <div class="grid grid-cols-24 gap-1" id="hour-grid"></div>
      <div class="flex justify-between mt-2 text-[9px] font-mono text-[#908fa0]">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
    </div>` : ''}
  </div>

  <!-- Model Distribution -->
  <div class="space-y-8">
    <div class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
      <h3 class="text-xl font-bold text-[#e3e2e3] mb-6">Model Distribution</h3>
      <div class="w-full h-4 flex rounded-full overflow-hidden mb-6" style="gap:2px">
        ${modelEntries.map(([, cost], i) => {
          const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
          return `<div class="h-full" style="width:${pct}%;background:${modelColors[i % modelColors.length]};border-radius:${i === 0 ? '9999px 0 0 9999px' : i === modelEntries.length - 1 ? '0 9999px 9999px 0' : '0'}"></div>`;
        }).join('')}
      </div>
      <div class="grid grid-cols-2 gap-4">
        ${modelEntries.map(([name, cost], i) => {
          const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0';
          return `<div class="flex items-center gap-2">
            <div class="w-2 h-2 rounded-full" style="background:${modelColors[i % modelColors.length]}"></div>
            <span class="text-xs font-mono text-[#c7c4d7]">${name}</span>
            <span class="text-xs font-mono text-[#908fa0]">${fmtCost(cost)}</span>
            <span class="text-[10px] text-[#464554] font-mono">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
      ${modelRouting?.available ? `
      <div class="mt-6 pt-6 border-t border-[rgba(70,69,84,0.15)] text-sm text-[#c7c4d7]">
        <span class="font-mono">${modelRouting.opusPct}%</span> Opus &middot;
        <span class="font-mono">${modelRouting.sonnetPct}%</span> Sonnet &middot;
        <span class="font-mono">${modelRouting.haikuPct}%</span> Haiku
        ${modelRouting.estimatedSavings > 10 ? `<span class="text-[#c0c1ff] ml-3 font-mono">~${fmtCost(modelRouting.estimatedSavings)} potential savings</span>` : ''}
      </div>` : ''}
    </div>

    <!-- 9. RECOMMENDATIONS (placed alongside model distribution) -->
    ${recommendations.length > 0 ? `
    <div class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
      <h3 class="text-xl font-bold text-[#e3e2e3] mb-6">Recommendations</h3>
      <div class="space-y-4">
        ${recommendations.map(r => {
          const sev = sevColorMap[r.severity] || sevColorMap.info;
          return `<div class="p-4 bg-[#0d0e0f] rounded-r-xl" style="border-left:4px solid ${sev.border}">
            <p class="text-xs font-bold text-[#e3e2e3] mb-1">${r.title}</p>
            <p class="text-[11px] text-[#c7c4d7] mb-2">${r.detail}</p>
            <p class="text-[11px] font-semibold" style="color:${sev.text}">&rarr; ${r.action}</p>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  </div>
</section>

<!-- 7. PROJECTS TABLE -->
${projectBreakdown && projectBreakdown.length > 0 ? `
<section class="bg-[#1b1c1d] rounded-xl border border-[rgba(70,69,84,0.15)] overflow-hidden">
  <div class="px-8 py-6 border-b border-[rgba(70,69,84,0.15)]">
    <h3 class="text-xl font-bold text-[#e3e2e3]">Projects</h3>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left" id="proj-tbl">
      <thead class="bg-[#0d0e0f] border-b border-[rgba(70,69,84,0.15)]">
        <tr>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Project</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Messages</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Sessions</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Output</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0] text-right">Cache Read</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[rgba(70,69,84,0.15)]"></tbody>
    </table>
  </div>
</section>
` : ''}

<!-- 8. ANOMALIES TABLE -->
${anomalies.hasAnomalies ? `
<section class="bg-[#1b1c1d] rounded-xl border border-[rgba(70,69,84,0.15)] overflow-hidden">
  <div class="px-8 py-6 border-b border-[rgba(70,69,84,0.15)] flex justify-between items-center">
    <h3 class="text-xl font-bold text-[#e3e2e3]">Detected Anomalies</h3>
    <span class="material-symbols-outlined text-[#ffb4ab] animate-pulse">warning</span>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead class="bg-[#0d0e0f] border-b border-[rgba(70,69,84,0.15)]">
        <tr>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Date</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Cost</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Deviation</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Cache Ratio</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0] text-right">Severity</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[rgba(70,69,84,0.15)]">
        ${anomalies.anomalies.map(a => {
          const sevBg = a.severity === 'critical' ? 'rgba(255, 180, 171, 0.10)' : 'rgba(255, 182, 144, 0.10)';
          const sevText = a.severity === 'critical' ? '#ffb4ab' : '#ffb690';
          return `<tr class="tbl-row">
            <td class="px-8 py-4 font-mono text-sm text-[#e3e2e3]">${a.date}</td>
            <td class="px-8 py-4 font-mono text-sm text-[#e3e2e3] font-bold">${fmtCost(a.cost)}</td>
            <td class="px-8 py-4 font-mono text-sm font-bold" style="color:${a.deviation > 0 ? '#ffb4ab' : '#c0c1ff'}">${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)}</td>
            <td class="px-8 py-4 font-mono text-sm text-[#c7c4d7]">${a.cacheOutputRatio ? a.cacheOutputRatio.toLocaleString() + ':1' : ''}</td>
            <td class="px-8 py-4 text-right"><span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase" style="background:${sevBg};color:${sevText}">${a.severity}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>
</section>
` : ''}

<!-- 10. CLAUDE.md ANALYSIS -->
<section class="bg-[#1b1c1d] rounded-xl border border-[rgba(70,69,84,0.15)] overflow-hidden">
  <div class="px-8 py-6 border-b border-[rgba(70,69,84,0.15)]">
    <h3 class="text-xl font-bold text-[#e3e2e3]">CLAUDE.md Analysis</h3>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead class="bg-[#0d0e0f] border-b border-[rgba(70,69,84,0.15)]">
        <tr>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">File</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Size</th>
          <th class="px-8 py-4 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0] text-right">Tokens</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[rgba(70,69,84,0.15)]">
        ${claudeMdStack.files.map(f => `<tr class="tbl-row">
          <td class="px-8 py-4 text-sm font-semibold text-[#e3e2e3]">${f.level}</td>
          <td class="px-8 py-4 font-mono text-sm text-[#c7c4d7]">${(f.bytes / 1024).toFixed(1)} KB</td>
          <td class="px-8 py-4 font-mono text-sm text-[#c7c4d7] text-right">${f.tokensEstimate.toLocaleString()}</td>
        </tr>`).join('')}
        <tr class="tbl-row bg-[#0d0e0f]">
          <td class="px-8 py-4 text-sm font-semibold text-[#e3e2e3]">Per-message cost</td>
          <td colspan="2" class="px-8 py-4 font-mono text-sm text-[#c7c4d7] text-right">
            <span class="text-[#c0c1ff]">$${claudeMdStack.costPerMessage.cached.toFixed(4)}</span> cached /
            <span class="text-[#ffb690]">$${claudeMdStack.costPerMessage.uncached.toFixed(4)}</span> uncached
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</section>

<!-- 11. CACHE SAVINGS -->
${cacheHealth.savings?.fromCaching > 0 ? `
<section class="grid grid-cols-1 md:grid-cols-2 rounded-xl overflow-hidden border border-[rgba(70,69,84,0.15)]" style="gap:1px; background:rgba(70,69,84,0.15);">
  <div class="p-8 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Saved by Cache</span>
    <span class="font-mono text-3xl font-bold block text-[#c0c1ff]">~$${Number(cacheHealth.savings.fromCaching).toLocaleString()}</span>
    <span class="text-[10px] text-[#908fa0] mt-2 block">vs standard input pricing</span>
  </div>
  <div class="p-8 bg-[#0d0e0f]">
    <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">Wasted on Breaks</span>
    <span class="font-mono text-3xl font-bold block text-[#ffb690]">~$${Number(cacheHealth.savings.wastedFromBreaks).toLocaleString()}</span>
    <span class="text-[10px] text-[#908fa0] mt-2 block">from cache invalidation</span>
  </div>
</section>
` : ''}

${cacheHealth.totalCacheBreaks > 0 ? `
<!-- Cache Break Reasons -->
<section class="bg-[#1b1c1d] p-8 rounded-xl border border-[rgba(70,69,84,0.15)]">
  <h3 class="text-xl font-bold text-[#e3e2e3] mb-6">Cache Break Reasons</h3>
  <div class="space-y-4">
    ${(cacheHealth.reasonsRanked || []).map(r => `
    <div class="space-y-1">
      <div class="flex justify-between text-[11px] font-mono">
        <span class="text-[#c7c4d7]">${r.reason}</span>
        <span class="text-[#908fa0]">${r.count}</span>
      </div>
      <div class="h-1.5 bg-[#343536] rounded-full overflow-hidden">
        <div class="h-full bg-[#ffb690] rounded-full" style="width:${r.percentage}%"></div>
      </div>
    </div>`).join('')}
  </div>
</section>
` : ''}

</main>

<!-- 12. FOOTER -->
<footer class="w-full py-12 border-t border-[rgba(70,69,84,0.05)]">
  <div class="max-w-[1200px] mx-auto px-6 text-center">
    <span class="text-[10px] tracking-widest uppercase text-[#908fa0]">CC Hubber &middot; shipped fast with Mover OS</span>
  </div>
</footer>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<script>
(function(){
  var D=${dailyCostsJSON}, P=${projectsJSON};
  var HR=${sessionIntel?.hourDistribution ? JSON.stringify(sessionIntel.hourDistribution) : 'null'};
  var CACHE_R=0.50,OUT=25,INP=5,CW=6.25;

  function fc(n){return n>=100?'$'+Math.round(n).toLocaleString():'$'+n.toFixed(2)}
  function ft(n){return n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toString()}

  // Hour heatmap
  if(HR){
    var hg=document.getElementById('hour-grid');
    if(hg){
      var mx=Math.max.apply(null,HR);
      var html='';
      for(var i=0;i<24;i++){
        var intensity=mx>0?HR[i]/mx:0;
        // Stitch palette: primary #c0c1ff at varying opacity
        var opac=intensity>0.8?'0.9':intensity>0.6?'0.7':intensity>0.4?'0.5':intensity>0.2?'0.3':intensity>0.05?'0.15':'0.05';
        html+='<div class="aspect-square rounded-sm" style="background:rgba(192,193,255,'+opac+')" title="'+i+':00 - '+HR[i]+' messages"></div>';
      }
      hg.innerHTML=html;
    }
  }

  // Project table
  var ptb=document.querySelector('#proj-tbl tbody');
  if(ptb&&P.length>0){
    P.sort(function(a,b){return(b.output/1e6*OUT+b.cacheRead/1e6*CACHE_R)-(a.output/1e6*OUT+a.cacheRead/1e6*CACHE_R)});
    var h='';
    for(var i=0;i<Math.min(P.length,10);i++){
      var p=P[i];
      h+='<tr class="tbl-row">';
      h+='<td class="px-8 py-4 text-sm font-semibold text-[#e3e2e3]">'+p.name;
      if(p.path)h+='<br><span class="text-[10px] text-[#908fa0] font-mono">'+p.path+'</span>';
      h+='</td>';
      h+='<td class="px-8 py-4 font-mono text-sm text-[#c7c4d7]">'+p.messages.toLocaleString()+'</td>';
      h+='<td class="px-8 py-4 font-mono text-sm text-[#c7c4d7]">'+p.sessions+'</td>';
      h+='<td class="px-8 py-4 font-mono text-sm text-[#c7c4d7]">'+ft(p.output)+'</td>';
      h+='<td class="px-8 py-4 font-mono text-sm text-[#c7c4d7] text-right">'+ft(p.cacheRead)+'</td>';
      h+='</tr>';
    }
    ptb.innerHTML=h;
  }

  // Chart
  var W=900,H=200,PD={t:24,r:16,b:40,l:56};
  var cW=W-PD.l-PD.r,cH=H-PD.t-PD.b;
  var svg=document.getElementById('cost-chart-svg');
  var tt=document.getElementById('tt'),ttd=document.getElementById('tt-d'),ttc=document.getElementById('tt-c'),tta=document.getElementById('tt-a');

  function filt(r){return r==='all'?D:D.slice(-parseInt(r,10))}

  function chart(d){
    if(!svg)return;
    if(!d.length){svg.innerHTML='<text x="450" y="100" text-anchor="middle" fill="#908fa0" font-size="13" font-family="Inter,sans-serif">No data</text>';return}
    var mx=Math.max.apply(null,d.map(function(x){return x.cost}))*1.1;if(mx<0.01)mx=1;
    var s='';
    // grid lines
    for(var i=0;i<=3;i++){
      var y=PD.t+(cH/3)*i,v=mx-(mx/3)*i;
      s+='<line x1="'+PD.l+'" y1="'+y+'" x2="'+(W-PD.r)+'" y2="'+y+'" stroke="rgba(70,69,84,0.15)" stroke-width="1"/>';
      s+='<text x="'+(PD.l-10)+'" y="'+(y+4)+'" text-anchor="end" fill="#908fa0" font-size="9" font-family="JetBrains Mono,monospace">$'+(v<1?v.toFixed(2):Math.round(v))+'</text>';
    }
    // area + line
    var step=d.length>1?cW/(d.length-1):0;
    var pts=d.map(function(x,j){return{x:PD.l+(d.length===1?cW/2:j*step),y:PD.t+cH-(x.cost/mx)*cH}});
    var lp='M '+pts[0].x+' '+pts[0].y;
    var ap='M '+pts[0].x+' '+(PD.t+cH)+' L '+pts[0].x+' '+pts[0].y;
    for(var j=1;j<pts.length;j++){var cx=(pts[j-1].x+pts[j].x)/2;lp+=' C '+cx+' '+pts[j-1].y+' '+cx+' '+pts[j].y+' '+pts[j].x+' '+pts[j].y;ap+=' C '+cx+' '+pts[j-1].y+' '+cx+' '+pts[j].y+' '+pts[j].x+' '+pts[j].y}
    ap+=' L '+pts[pts.length-1].x+' '+(PD.t+cH)+' Z';
    // Stitch gradient: primary at 30% to transparent
    s+='<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c0c1ff" stop-opacity="0.3"/><stop offset="100%" stop-color="#c0c1ff" stop-opacity="0"/></linearGradient></defs>';
    s+='<path d="'+ap+'" fill="url(#ag)"/>';
    s+='<path d="'+lp+'" fill="none" stroke="#c0c1ff" stroke-width="2" stroke-linecap="round"/>';
    // x labels
    var every=Math.max(1,Math.floor(d.length/8));
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step);
      if(j%every===0||j===d.length-1)s+='<text x="'+px+'" y="'+(H-6)+'" text-anchor="middle" fill="#908fa0" font-size="9" font-family="JetBrains Mono,monospace">'+x.date.slice(5)+'</text>';
    });
    // anomaly dots
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step),py=PD.t+cH-(x.cost/mx)*cH;
      if(x.isAnomaly)s+='<circle cx="'+px+'" cy="'+py+'" r="4" fill="#ffb4ab" stroke="#121315" stroke-width="2"/>';
    });
    // hover targets
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step),py=PD.t+cH-(x.cost/mx)*cH;
      s+='<circle cx="'+px+'" cy="'+py+'" r="14" fill="transparent" data-d="'+x.date+'" data-c="'+x.cost+'" data-a="'+(x.isAnomaly?1:0)+'" class="hov" style="cursor:crosshair"/>';
    });
    svg.innerHTML=s;
    svg.querySelectorAll('.hov').forEach(function(el){
      el.addEventListener('mouseenter',function(e){
        ttd.textContent=e.target.dataset.d;
        ttc.textContent=fc(parseFloat(e.target.dataset.c));
        tta.textContent=e.target.dataset.a==='1'?'ANOMALY':'';
        tta.style.display=e.target.dataset.a==='1'?'block':'none';
        tt.classList.add('on');
      });
      el.addEventListener('mousemove',function(e){tt.style.left=(e.clientX+14)+'px';tt.style.top=(e.clientY-40)+'px'});
      el.addEventListener('mouseleave',function(){tt.classList.remove('on')});
    });
  }

  var RL={7:'Last 7 days',30:'Last 30 days',90:'Last 90 days',all:'All time'};

  function setR(r){
    var f=filt(r);chart(f);
    var ci=document.getElementById('chart-info');
    if(ci&&f.length){var t=f.reduce(function(s,x){return s+x.cost},0),a=f.filter(function(x){return x.cost>0}).length;ci.textContent=a+' days \u00b7 '+fc(t)}
    var rl=document.getElementById('range-lbl');if(rl)rl.textContent=RL[r]||'All time';
    if(f.length){
      var t=f.reduce(function(s,x){return s+x.cost},0),a=f.filter(function(x){return x.cost>0}).length;
      var hc=document.getElementById('h-cost'),hd=document.getElementById('h-days');
      var ot=document.getElementById('ov-total'),oa=document.getElementById('ov-avg');
      if(hc)hc.textContent=fc(t);if(hd)hd.textContent=a;
      if(ot)ot.textContent=fc(t);if(oa&&a>0)oa.textContent=fc(t/a)+' avg/day';
    }
    // Update filter button states - Stitch style
    document.querySelectorAll('.cfilt').forEach(function(b){
      if(b.dataset.r===r){
        b.style.background='#c0c1ff';b.style.color='#1000a9';
      } else {
        b.style.background='transparent';b.style.color='#908fa0';
      }
    });
  }

  document.querySelectorAll('.cfilt').forEach(function(b){b.addEventListener('click',function(){setR(b.dataset.r)})});

  // PNG/GIF export
  var pb=document.getElementById('btn-png'),toast=document.getElementById('toast');
  if(pb)pb.addEventListener('click',function(){
    var card=document.getElementById('share-card');
    if(!card||typeof html2canvas==='undefined')return;
    pb.innerHTML='<span class="material-symbols-outlined text-sm animate-spin">progress_activity</span> Exporting...';pb.disabled=true;
    html2canvas(card,{backgroundColor:'#121315',scale:2,useCORS:true,logging:false}).then(function(c){
      var a=document.createElement('a');a.download='cchubber.png';a.href=c.toDataURL('image/png');a.click();
      pb.innerHTML='<span class="material-symbols-outlined text-sm">download</span> Save as GIF';
      pb.disabled=false;showToast('Saved to downloads');
    }).catch(function(){
      pb.innerHTML='<span class="material-symbols-outlined text-sm">download</span> Save as GIF';
      pb.disabled=false;showToast('Export failed');
    });
  });

  function showToast(m){if(!toast)return;toast.textContent=m;toast.classList.add('on');setTimeout(function(){toast.classList.remove('on')},2000)}

  setR('all');
})();
</script>
</body>
</html>`;
}

export function renderRateLimits(usage) {
  const fiveHour = usage.five_hour;
  const sevenDay = usage.seven_day;
  if (!fiveHour && !sevenDay) return '';

  const fivePct = fiveHour?.utilization ?? 0;
  const sevenPct = sevenDay?.utilization ?? 0;
  const fiveColor = fivePct > 80 ? '#ffb4ab' : fivePct > 50 ? '#ffb690' : '#c0c1ff';
  const sevenColor = sevenPct > 80 ? '#ffb4ab' : sevenPct > 50 ? '#ffb690' : '#c0c1ff';

  return `
  <section class="grid grid-cols-1 md:grid-cols-2 rounded-xl overflow-hidden border border-[rgba(70,69,84,0.15)]" style="gap:1px; background:rgba(70,69,84,0.15);">
    <div class="p-6 bg-[#0d0e0f]">
      <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">5-Hour Session</span>
      <span class="font-mono text-2xl font-bold block" style="color:${fiveColor}">${fivePct}%</span>
      <div class="h-1.5 bg-[#343536] rounded-full overflow-hidden mt-3 mb-2">
        <div class="h-full rounded-full" style="width:${fivePct}%;background:${fiveColor}"></div>
      </div>
      <span class="text-[10px] text-[#908fa0] block font-mono">${fiveHour?.resets_at ? 'Resets ' + new Date(fiveHour.resets_at).toLocaleTimeString() : ''}</span>
    </div>
    <div class="p-6 bg-[#0d0e0f]">
      <span class="text-[10px] uppercase tracking-[0.05em] text-[#908fa0] block mb-3">7-Day Rolling</span>
      <span class="font-mono text-2xl font-bold block" style="color:${sevenColor}">${sevenPct}%</span>
      <div class="h-1.5 bg-[#343536] rounded-full overflow-hidden mt-3 mb-2">
        <div class="h-full rounded-full" style="width:${sevenPct}%;background:${sevenColor}"></div>
      </div>
      <span class="text-[10px] text-[#908fa0] block font-mono">${sevenDay?.resets_at ? 'Resets ' + new Date(sevenDay.resets_at).toLocaleDateString() : ''}</span>
    </div>
  </section>`;
}
