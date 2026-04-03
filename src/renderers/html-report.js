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

<!-- 2. SHARE CARD — HTML for display, Canvas for video export -->
<section class="flex flex-col items-center">
  <style>
    @keyframes cardFloat{
      0%,100%{transform:perspective(800px) rotateY(-2deg) rotateX(1deg)}
      50%{transform:perspective(800px) rotateY(2deg) rotateX(-1deg)}
    }
    @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
    .cc-card{
      position:relative;width:100%;max-width:740px;
      border-radius:22px;overflow:hidden;
      background:linear-gradient(145deg,#1a1b2e 0%,#151622 20%,#0f1018 40%,#131428 55%,#191a2d 70%,#141520 85%,#12131f 100%);
      box-shadow:0 2px 4px rgba(0,0,0,0.1),0 8px 16px rgba(0,0,0,0.1),0 16px 32px rgba(0,0,0,0.15);
      animation:cardFloat 6s ease-in-out infinite;
    }
    .cc-card::before{
      content:'';position:absolute;inset:0;
      background:linear-gradient(105deg,transparent 30%,rgba(192,193,255,0.04) 45%,rgba(212,187,255,0.06) 50%,rgba(192,193,255,0.04) 55%,transparent 70%);
      background-size:200% 100%;animation:shimmer 4s ease-in-out infinite;
      pointer-events:none;z-index:2;
    }
    .cc-card::after{
      content:'';position:absolute;inset:0;z-index:1;pointer-events:none;opacity:0.035;
      background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-size:128px 128px;
    }
    .cc-inner{position:relative;z-index:3;display:flex;flex-direction:column;justify-content:space-between;padding:36px 40px;min-height:280px;}
    .cc-card.no-shimmer::before{display:none!important;}
  </style>
  <div class="cc-card" id="share-card-html">
    <div class="cc-inner">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-4">
          <div class="w-14 h-14 flex items-center justify-center rounded-[12px]" style="background:${gradeColor}">
            <span class="text-[30px]" style="color:#0f1018;font-weight:900;">${grade.letter}</span>
          </div>
          <div>
            <span class="text-[10px] font-mono uppercase tracking-[0.08em] font-bold block" style="color:${gradeColor}">${grade.label}</span>
            <span class="text-xl font-bold text-[#e3e2e3]">${gradeLabel}</span>
          </div>
        </div>
        <div class="text-right">
          <span class="text-[11px] font-mono uppercase tracking-[0.1em] text-[#908fa0] font-bold block">Claude Code</span>
          <span class="text-[11px] font-mono uppercase tracking-[0.06em] text-[#596678] block" id="card-range">All time</span>
        </div>
      </div>
      <div class="flex justify-between items-end">
        <div>
          <p class="text-[10px] uppercase tracking-[0.06em] text-[#908fa0] mb-1">Total Spend</p>
          <p class="font-mono text-[40px] font-bold text-[#e3e2e3] leading-none" id="h-cost">${fmtCost(totalCost)}</p>
        </div>
        <div class="text-center">
          <p class="text-[10px] uppercase tracking-[0.06em] text-[#908fa0] mb-1">Active Days</p>
          <p class="font-mono text-[40px] font-bold text-[#e3e2e3] leading-none" id="h-days">${activeDays}</p>
        </div>
        <div class="text-right">
          <p class="text-[10px] uppercase tracking-[0.06em] text-[#908fa0] mb-1">Cache Ratio</p>
          <p class="font-mono text-[40px] font-bold text-[#e3e2e3] leading-none">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}</p>
        </div>
      </div>
      <div class="flex justify-between items-end">
        <p class="text-[12px] text-[#908fa0]">${diagnosisLine}</p>
        <div class="flex items-center gap-2 text-[12px] font-mono tracking-[0.03em] shrink-0">
          <a href="https://github.com/azkhh/cchubber" target="_blank" class="text-[#c0c1ff] hover:text-[#e1e0ff]" style="text-decoration:none;font-weight:600;">CC Hubber</a>
          <span class="text-[#464554]">&middot;</span>
          <span class="text-[#908fa0]">shipped fast with</span>
          <a href="https://moveros.dev" target="_blank" class="text-[#c0c1ff] hover:text-[#e1e0ff]" style="text-decoration:none;font-weight:600;">Mover OS</a>
        </div>
      </div>
    </div>
  </div>
  <!-- Hidden canvas for video recording -->
  <canvas id="share-card" style="display:none;"></canvas>
  <div class="flex justify-center mt-5">
    <button id="btn-gif" class="px-5 py-2 border border-[rgba(70,69,84,0.3)] rounded-lg text-xs font-semibold text-[#908fa0] hover:bg-[#292a2b] hover:text-[#e3e2e3] transition-colors flex items-center gap-2 cursor-pointer">
      <span class="material-symbols-outlined text-sm">videocam</span>
      Save Video
    </button>
  </div>
</section>

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
      <div class="" id="hour-grid" style="display:flex;justify-content:space-between;align-items:flex-end;padding:0 4px;"></div>
      <!-- labels rendered by JS -->
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
      <div class="space-y-3">
        ${recommendations.slice(0, 4).map(r => {
          const sev = sevColorMap[r.severity] || sevColorMap.info;
          return `<div class="p-4 bg-[#0d0e0f] rounded-r-lg flex items-start gap-4" style="border-left:3px solid ${sev.border}">
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-semibold text-[#e3e2e3]">${r.title}</p>
              <p class="text-[11px] text-[#908fa0] mt-1 leading-relaxed">${r.action}</p>
            </div>
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

<!-- 10. CLAUDE.md ANALYSIS — Global only, section breakdown -->
<section class="bg-[#1b1c1d] rounded-xl border border-[rgba(70,69,84,0.15)] overflow-hidden">
  <div class="px-8 py-6 border-b border-[rgba(70,69,84,0.15)] flex justify-between items-center">
    <h3 class="text-xl font-bold text-[#e3e2e3]">CLAUDE.md Analysis</h3>
    <div class="text-right">
      <span class="font-mono text-sm text-[#e3e2e3]">${claudeMdStack.files[0]?.lineCount || '?'} lines</span>
      <span class="text-[#908fa0] mx-2">&middot;</span>
      <span class="font-mono text-sm text-[#e3e2e3]">~${claudeMdStack.totalTokensEstimate.toLocaleString()} tokens</span>
      <span class="text-[#908fa0] mx-2">&middot;</span>
      <span class="font-mono text-sm text-[#e3e2e3]">${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB</span>
    </div>
  </div>
  <div class="px-8 py-4 bg-[#0d0e0f] border-b border-[rgba(70,69,84,0.15)] flex justify-between text-xs">
    <span class="text-[#908fa0]">Per-message cost impact</span>
    <span class="font-mono">
      <span class="text-[#c0c1ff]">$${claudeMdStack.costPerMessage.cached.toFixed(4)}</span> cached &middot;
      <span class="text-[#ffb690]">$${claudeMdStack.costPerMessage.uncached.toFixed(4)}</span> uncached &middot;
      <span class="text-[#ffb4ab]">$${(claudeMdStack.costPerMessage.dailyCached200 || 0).toFixed(2)}</span>/day at 200 msgs
    </span>
  </div>
  ${claudeMdStack.globalSections && claudeMdStack.globalSections.length > 0 ? `
  <div class="overflow-x-auto">
    <table class="w-full text-left">
      <thead class="bg-[#0d0e0f] border-b border-[rgba(70,69,84,0.15)]">
        <tr>
          <th class="px-8 py-3 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0]">Section</th>
          <th class="px-8 py-3 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0] text-right">Lines</th>
          <th class="px-8 py-3 text-[10px] uppercase font-bold tracking-[0.05em] text-[#908fa0] text-right">Tokens</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[rgba(70,69,84,0.15)]">
        ${claudeMdStack.globalSections.slice(0, 12).map(s => `<tr class="tbl-row">
          <td class="px-8 py-3 text-sm text-[#e3e2e3]">${s.name}</td>
          <td class="px-8 py-3 font-mono text-sm text-[#c7c4d7] text-right">${s.lines}</td>
          <td class="px-8 py-3 font-mono text-sm text-[#c7c4d7] text-right">${s.tokens.toLocaleString()}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
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

<script src="https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js"></script>
<script>
(function(){
  var D=${dailyCostsJSON}, P=${projectsJSON};
  var CARD={
    grade:'${grade.letter}',gradeLabel:'${grade.label}',gradePerf:'${gradeLabel}',
    gradeColor:'${gradeColor}',
    cost:'${fmtCost(totalCost)}',days:'${activeDays}',
    ratio:'${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}',
    diagnosis:'${diagnosisLine.replace(/'/g, "\\'")}',
    range:'All time'
  };
  var HR=${sessionIntel?.hourDistribution ? JSON.stringify(sessionIntel.hourDistribution) : 'null'};
  var CACHE_R=0.50,OUT=25,INP=5,CW=6.25;

  function fc(n){return n>=100?'$'+Math.round(n).toLocaleString():'$'+n.toFixed(2)}
  function ft(n){return n>=1e9?(n/1e9).toFixed(1)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':n.toString()}

  // Hour activity — vertical bar chart
  if(HR){
    var hg=document.getElementById('hour-grid');
    if(hg){
      var mx=Math.max.apply(null,HR);
      var html='';
      for(var i=0;i<24;i++){
        var pct=mx>0?Math.max(HR[i]/mx*100,2):2;
        var opac=pct>70?'0.85':pct>40?'0.6':pct>15?'0.35':'0.12';
        html+='<div style="display:flex;flex-direction:column;align-items:center;gap:4px;" title="'+i+':00 — '+HR[i]+' messages">';
        html+='<div style="width:3px;height:80px;background:rgba(70,69,84,0.2);border-radius:2px;position:relative;overflow:hidden;">';
        html+='<div style="position:absolute;bottom:0;width:100%;height:'+pct+'%;background:rgba(192,193,255,'+opac+');border-radius:2px;"></div>';
        html+='</div>';
        html+='<span style="font-size:8px;font-family:JetBrains Mono,monospace;color:'+(i%6===0?'#908fa0':'#464554')+';">'+i+'</span>';
        html+='</div>';
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
    CARD.range=RL[r]||'All time';
    var cr=document.getElementById('card-range');if(cr)cr.textContent=CARD.range;
    if(f.length){
      var t=f.reduce(function(s,x){return s+x.cost},0),a=f.filter(function(x){return x.cost>0}).length;
      CARD.cost=fc(t);CARD.days=a.toString();
      // Update HTML card
      var hc=document.getElementById('h-cost');if(hc)hc.textContent=fc(t);
      var hd=document.getElementById('h-days');if(hd)hd.textContent=a;
      // Update overview
      var ot=document.getElementById('ov-total'),oa=document.getElementById('ov-avg');
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

  // Export helpers
  var toast=document.getElementById('toast');
  function showToast(m){if(!toast)return;toast.textContent=m;toast.classList.add('on');setTimeout(function(){toast.classList.remove('on')},2000)}

  // ─── CANVAS SHARE CARD ─────────────────────────────
  // Renders entirely on canvas — same output for display AND video export
  var cardCanvas=document.getElementById('share-card');
  var cardW=1480,cardH=580,cardR=44; // 2x resolution for retina
  cardCanvas.width=cardW;cardCanvas.height=cardH;
  var cardCtx=cardCanvas.getContext('2d');

  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
  }

  function drawCard(ctx,w,h,shimmerT){
    // Background gradient
    var bg=ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#1a1b2e');bg.addColorStop(0.4,'#0f1018');bg.addColorStop(0.7,'#191a2d');bg.addColorStop(1,'#12131f');
    roundRect(ctx,0,0,w,h,cardR);ctx.save();ctx.clip();
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);

    var pad=80,padT=72;

    // Grade badge
    var bx=pad,by=padT,bs=112;
    roundRect(ctx,bx,by,bs,bs,24);
    ctx.fillStyle=CARD.gradeColor;ctx.fill();
    ctx.font='800 56px "JetBrains Mono",monospace';ctx.fillStyle='#0f1018';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(CARD.grade,bx+bs/2,by+bs/2);

    // Grade label + performance text
    ctx.textAlign='left';ctx.textBaseline='top';
    ctx.font='700 18px "JetBrains Mono",monospace';ctx.fillStyle=CARD.gradeColor;
    ctx.fillText(CARD.gradeLabel.toUpperCase(),bx+bs+32,by+12);
    ctx.font='700 36px "Inter",sans-serif';ctx.fillStyle='#e3e2e3';
    ctx.fillText(CARD.gradePerf,bx+bs+32,by+40);

    // Top right: Claude Code + range
    ctx.textAlign='right';
    ctx.font='700 20px "JetBrains Mono",monospace';ctx.fillStyle='#908fa0';
    ctx.fillText('CLAUDE CODE',w-pad,padT+16);
    ctx.font='400 16px "JetBrains Mono",monospace';ctx.fillStyle='#464554';
    ctx.fillText(CARD.range,w-pad,padT+44);

    // Stats row
    var statsY=h*0.45;
    var labels=['TOTAL SPEND','ACTIVE DAYS','CACHE RATIO'];
    var values=[CARD.cost,CARD.days,CARD.ratio];
    var positions=[pad,w*0.38,w*0.7];
    var aligns=['left','center','right'];
    var xEnds=[null,null,w-pad];

    for(var i=0;i<3;i++){
      ctx.textAlign=i===2?'right':i===1?'center':'left';
      var sx=i===2?w-pad:i===1?w/2:pad;
      ctx.font='400 16px "Inter",sans-serif';ctx.fillStyle='#908fa0';
      ctx.fillText(labels[i],sx,statsY);
      ctx.font='700 64px "JetBrains Mono",monospace';ctx.fillStyle='#e3e2e3';
      ctx.fillText(values[i],sx,statsY+28);
    }

    // Bottom: diagnosis + branding
    var botY=h-padT;
    ctx.textAlign='left';
    ctx.font='400 20px "Inter",sans-serif';ctx.fillStyle='#908fa0';
    ctx.fillText(CARD.diagnosis,pad,botY);

    // Branding — measure text to space properly
    ctx.textAlign='right';
    ctx.font='500 18px "JetBrains Mono",monospace';
    var moverW=ctx.measureText('Mover OS').width;
    ctx.font='400 18px "Inter",sans-serif';
    var shippedW=ctx.measureText(' shipped fast with ').width;
    ctx.font='500 18px "JetBrains Mono",monospace';
    var hubberW=ctx.measureText('CC Hubber').width;

    var bx=w-pad;
    ctx.font='500 18px "JetBrains Mono",monospace';ctx.fillStyle='#c0c1ff';
    ctx.fillText('Mover OS',bx,botY);
    bx-=moverW;
    ctx.font='400 18px "Inter",sans-serif';ctx.fillStyle='#908fa0';
    ctx.fillText(' shipped fast with ',bx,botY);
    bx-=shippedW;
    ctx.font='500 18px "JetBrains Mono",monospace';ctx.fillStyle='#c0c1ff';
    ctx.fillText('CC Hubber',bx,botY);

    // Subtle shimmer sweep
    if(shimmerT!==undefined){
      var sx=-w*0.4+(shimmerT%1)*w*1.8;
      var sg=ctx.createLinearGradient(sx,0,sx+w*0.3,h);
      sg.addColorStop(0,'rgba(255,255,255,0)');
      sg.addColorStop(0.45,'rgba(192,193,255,0.02)');
      sg.addColorStop(0.5,'rgba(255,255,255,0.045)');
      sg.addColorStop(0.55,'rgba(212,187,255,0.02)');
      sg.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sg;ctx.fillRect(0,0,w,h);
    }

    ctx.restore();
  }

  // Animate the card on the page
  var cardAnimStart=null;
  function animateCard(ts){
    if(!cardAnimStart)cardAnimStart=ts;
    var t=((ts-cardAnimStart)%6000)/6000;
    drawCard(cardCtx,cardW,cardH,t);
    requestAnimationFrame(animateCard);
  }
  document.fonts.ready.then(function(){requestAnimationFrame(animateCard)});

  // ─── VIDEO EXPORT (records the same canvas) ──────
  // Video export — captures HTML card with html-to-image, animates on canvas at 1440p
  var gb=document.getElementById('btn-gif');
  if(gb)gb.addEventListener('click',function(){
    gb.textContent='Capturing...';gb.disabled=true;
    var htmlCard=document.getElementById('share-card-html');
    if(!htmlCard||typeof htmlToImage==='undefined'){gb.textContent='Save Video';gb.disabled=false;showToast('Library not loaded');return}

    // Pause animation + hide CSS shimmer/noise for clean capture
    htmlCard.style.animation='none';htmlCard.style.transform='none';
    htmlCard.classList.add('no-shimmer');

    document.fonts.ready.then(function(){
      return htmlToImage.toPng(htmlCard,{quality:1,pixelRatio:3}).then(function(dataUrl){
        htmlCard.style.animation='';htmlCard.style.transform='';
        htmlCard.classList.remove('no-shimmer');
        gb.textContent='Recording...';

        var img=new Image();
        img.onload=function(){
          // 2560x1440 canvas
          var VW=2560,VH=1440;
          var vidCanvas=document.createElement('canvas');vidCanvas.width=VW;vidCanvas.height=VH;
          var vctx=vidCanvas.getContext('2d');
          vctx.imageSmoothingEnabled=true;vctx.imageSmoothingQuality='high';

          // Scale card to fill ~90% of frame width for maximum impact
          var scale=Math.min((VW*0.88)/img.width,(VH*0.82)/img.height);
          var cw=Math.round(img.width*scale),ch=Math.round(img.height*scale);
          var r=22*3*scale; // border radius

          var stream=vidCanvas.captureStream(30);
          var chunks=[];
          // Prefer MP4 (Chrome 124+, works on X/Twitter), fallback WebM
          var mime=MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')?'video/mp4;codecs=avc1'
            :MediaRecorder.isTypeSupported('video/mp4')?'video/mp4':'video/webm';
          var ext=mime.startsWith('video/mp4')?'mp4':'webm';
          var recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:30000000});
          recorder.ondataavailable=function(e){if(e.data.size>0)chunks.push(e.data)};
          recorder.onstop=function(){
            var blob=new Blob(chunks,{type:mime.split(';')[0]});
            var a=document.createElement('a');a.download='cchubber-card.'+ext;
            a.href=URL.createObjectURL(blob);a.click();
            gb.innerHTML='<span class="material-symbols-outlined text-sm">videocam</span> Save Video';
            gb.disabled=false;showToast('Video saved ('+ext.toUpperCase()+')');
          };

          // Pre-generate noise texture to fight gradient banding
          var noiseC=document.createElement('canvas');noiseC.width=256;noiseC.height=256;
          var nctx=noiseC.getContext('2d');
          var ndata=nctx.createImageData(256,256);
          for(var ni=0;ni<ndata.data.length;ni+=4){var v=Math.random()*255;ndata.data[ni]=v;ndata.data[ni+1]=v;ndata.data[ni+2]=v;ndata.data[ni+3]=8;}
          nctx.putImageData(ndata,0,0);

          var duration=6000,startTime=null;
          recorder.start(100);

          function frame(ts){
            if(!startTime)startTime=ts;
            var elapsed=ts-startTime;
            if(elapsed>=duration){setTimeout(function(){recorder.stop()},300);return}

            var t=elapsed/duration;
            // Gentle breathe + float — matches the natural feel of the CSS animation
            // ease-in-out via cosine (same curve as CSS ease-in-out)
            // Pure horizontal drift — no zoom, no bob, just lateral movement
            var drift=Math.sin(t*Math.PI*2)*14; // +-14px, smooth sine, matches rotateY feel

            vctx.fillStyle='#000';vctx.fillRect(0,0,VW,VH);
            vctx.save();
            vctx.translate(Math.round((VW-cw)/2+drift),Math.round((VH-ch)/2));

            // Draw the HTML-captured card image (browser-quality)
            vctx.drawImage(img,0,0,cw,ch);

            // Shimmer — matches CSS ::before (angled sweep, same opacity)
            var shimProgress=(t*2)%1; // 2 sweeps per 6 seconds
            var sx=-cw*0.5+shimProgress*cw*2;
            // Angled gradient (top-left to bottom-right like CSS 105deg)
            var g=vctx.createLinearGradient(sx,0,sx+cw*0.4,ch);
            g.addColorStop(0,'rgba(255,255,255,0)');
            g.addColorStop(0.3,'rgba(192,193,255,0.04)');
            g.addColorStop(0.45,'rgba(212,187,255,0.06)');
            g.addColorStop(0.55,'rgba(192,193,255,0.06)');
            g.addColorStop(0.7,'rgba(212,187,255,0.04)');
            g.addColorStop(1,'rgba(255,255,255,0)');
            vctx.fillStyle=g;vctx.fillRect(0,0,cw,ch);

            // Noise dither — breaks up gradient banding from video compression
            var pat=vctx.createPattern(noiseC,'repeat');
            vctx.fillStyle=pat;vctx.globalAlpha=0.4;vctx.fillRect(0,0,cw,ch);vctx.globalAlpha=1;

            vctx.restore();
            requestAnimationFrame(frame);
          }

          requestAnimationFrame(frame);
        };
        img.src=dataUrl;
      });
    }).catch(function(e){
      htmlCard.style.animation='';htmlCard.style.transform='';htmlCard.classList.remove('no-shimmer');
      gb.innerHTML='<span class="material-symbols-outlined text-sm">videocam</span> Save Video';
      gb.disabled=false;showToast('Failed: '+e.message);
    });
  });

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
