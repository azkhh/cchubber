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

  // Diagnosis one-liner for the share card
  const diagnosisLine = inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2
    ? `Efficiency dropped ${inflection.multiplier}x on ${inflection.date}`
    : anomalies.hasAnomalies
    ? `${anomalies.anomalies.length} anomal${anomalies.anomalies.length === 1 ? 'y' : 'ies'} detected`
    : grade.letter === 'A' ? 'System running clean'
    : grade.letter === 'B' ? 'Minor optimization opportunities'
    : `Cache efficiency needs attention`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CC Hubber</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --bg: #09090b;
    --surface: #111113;
    --surface-2: #18181b;
    --border: #1f1f23;
    --border-hover: #2a2a2e;
    --text: #fafafa;
    --text-2: #a1a1aa;
    --text-3: #71717a;
    --text-4: #52525b;
    --accent: #6366f1;
    --accent-dim: #4f46e5;
    --green: #22c55e;
    --yellow: #eab308;
    --red: #ef4444;
    --orange: #f97316;
    --mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .wrap {
    max-width: 960px;
    margin: 0 auto;
    padding: 56px 20px 80px;
  }

  /* ── Header ── */
  .hdr { margin-bottom: 48px; }
  .hdr h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.3px; color: var(--text); }
  .hdr p { font-size: 13px; color: var(--text-3); margin-top: 2px; }

  /* ── Share Card ── */
  .share-wrap { margin-bottom: 48px; }

  .share-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 44px;
    position: relative;
  }

  .sc-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 32px;
  }

  .sc-grade {
    width: 64px;
    height: 64px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    font-weight: 800;
    letter-spacing: -1px;
    color: ${grade.color};
    background: ${grade.color}12;
    border: 1px solid ${grade.color}30;
  }

  .sc-label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-3);
    margin-top: 8px;
  }

  .sc-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
    margin-bottom: 28px;
  }

  .sc-stat-val {
    font-family: var(--mono);
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -1px;
    color: var(--text);
  }

  .sc-stat-lbl {
    font-size: 11px;
    color: var(--text-4);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }

  .sc-diagnosis {
    font-size: 13px;
    color: var(--text-2);
    padding-top: 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sc-brand {
    font-size: 11px;
    color: var(--text-4);
    font-weight: 500;
  }

  .sc-brand a { color: var(--text-4); text-decoration: none; }
  .sc-brand a:hover { color: var(--text-3); }

  /* Share button */
  .share-actions {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 12px;
  }

  .btn-share {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-3);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .btn-share:hover { border-color: var(--border-hover); color: var(--text-2); }
  .btn-share svg { width: 12px; height: 12px; }

  /* ── Section ── */
  .sect { margin-bottom: 40px; }
  .sect-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-4);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }

  /* ── Metric Grid ── */
  .mgrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }

  .mcell {
    background: var(--surface);
    padding: 16px 18px;
  }

  .mcell-label {
    font-size: 11px;
    color: var(--text-4);
    margin-bottom: 4px;
  }

  .mcell-val {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.5px;
  }

  .mcell-sub {
    font-size: 11px;
    color: var(--text-4);
    margin-top: 2px;
  }

  /* ── Chart ── */
  .chart-wrap {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }

  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .chart-filters {
    display: flex;
    gap: 4px;
  }

  .cfilt {
    padding: 3px 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text-4);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.12s;
  }

  .cfilt:hover { color: var(--text-3); }
  .cfilt.on { background: var(--surface-2); border-color: var(--border); color: var(--text-2); }

  #chart-info {
    font-size: 11px;
    color: var(--text-4);
    font-family: var(--mono);
  }

  #cost-chart-svg { width: 100%; overflow: visible; display: block; }

  /* Tooltip */
  .tt {
    position: fixed;
    background: var(--surface-2);
    border: 1px solid var(--border-hover);
    border-radius: 8px;
    padding: 8px 12px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s;
    z-index: 100;
    white-space: nowrap;
  }

  .tt.on { opacity: 1; }
  .tt-d { font-size: 11px; color: var(--text-3); margin-bottom: 2px; font-family: var(--mono); }
  .tt-c { font-size: 15px; font-weight: 600; font-family: var(--mono); }
  .tt-a { font-size: 10px; color: var(--red); margin-top: 2px; }

  /* ── Model bar ── */
  .mbar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    gap: 1px;
    margin-bottom: 12px;
  }

  .mbar-seg { height: 100%; }
  .mbar-seg:first-child { border-radius: 4px 0 0 4px; }
  .mbar-seg:last-child { border-radius: 0 4px 4px 0; }
  .mbar-seg:only-child { border-radius: 4px; }

  .mlegend { display: flex; flex-wrap: wrap; gap: 8px 16px; }

  .mleg-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .mleg-dot { width: 6px; height: 6px; border-radius: 2px; flex-shrink: 0; }
  .mleg-name { color: var(--text-3); }
  .mleg-cost { font-family: var(--mono); font-weight: 500; font-size: 12px; }
  .mleg-pct { color: var(--text-4); font-size: 11px; }

  /* ── Table ── */
  .tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .tbl th {
    text-align: left;
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-4);
    border-bottom: 1px solid var(--border);
  }

  .tbl td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text-2);
    font-size: 13px;
  }

  .tbl tr:last-child td { border-bottom: none; }
  .tbl .mono { font-family: var(--mono); font-size: 12px; }
  .tbl .strong { color: var(--text); font-weight: 500; }

  /* ── Recs ── */
  .rec {
    padding: 14px 18px;
    border-left: 2px solid;
    margin-bottom: 8px;
    border-radius: 0 8px 8px 0;
    background: var(--surface);
  }

  .rec.critical { border-left-color: var(--red); }
  .rec.warning { border-left-color: var(--yellow); }
  .rec.info { border-left-color: var(--accent); }
  .rec.positive { border-left-color: var(--green); }

  .rec-t { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
  .rec-d { font-size: 12px; color: var(--text-3); margin-bottom: 4px; }
  .rec-a { font-size: 12px; color: var(--accent); font-weight: 500; }

  /* ── Callout ── */
  .callout {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--orange);
    border-radius: 0 10px 10px 0;
    padding: 14px 18px;
    margin-bottom: 32px;
  }

  .callout-t { font-size: 12px; font-weight: 600; color: var(--orange); margin-bottom: 2px; }
  .callout-d { font-size: 13px; color: var(--text-2); }

  /* ── Activity heatmap (hour distribution) ── */
  .hour-grid {
    display: grid;
    grid-template-columns: repeat(24, 1fr);
    gap: 2px;
    margin-top: 8px;
  }

  .hour-cell {
    aspect-ratio: 1;
    border-radius: 3px;
    position: relative;
  }

  .hour-label {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-4);
    margin-top: 4px;
    font-family: var(--mono);
  }

  /* ── Rate limits ── */
  .rate-bg {
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    overflow: hidden;
    margin: 6px 0 3px;
  }

  .rate-fill { height: 100%; border-radius: 2px; }

  /* ── Badge ── */
  .badge {
    display: inline-flex;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-family: var(--mono);
  }

  .badge.critical { background: #ef444420; color: var(--red); }
  .badge.warning { background: #eab30820; color: var(--yellow); }

  /* ── Footer ── */
  .ftr {
    text-align: center;
    padding-top: 40px;
    font-size: 12px;
    color: var(--text-4);
  }

  .ftr a { color: var(--text-4); text-decoration: none; }
  .ftr a:hover { color: var(--text-3); }
  .ftr-acc { color: var(--accent); font-weight: 500; }

  /* ── Divider ── */
  .div { height: 1px; background: var(--border); margin: 0 0 32px; }

  /* ── Toast ── */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%) translateY(60px);
    background: var(--surface-2);
    border: 1px solid var(--border-hover);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 500;
    opacity: 0;
    transition: all 0.25s;
    z-index: 200;
    pointer-events: none;
  }

  .toast.on { opacity: 1; transform: translateX(-50%) translateY(0); }
</style>
</head>
<body>
<div class="tt" id="tt"><div class="tt-d" id="tt-d"></div><div class="tt-c" id="tt-c"></div><div class="tt-a" id="tt-a"></div></div>
<div class="toast" id="toast"></div>

<div class="wrap">

<!-- Header -->
<div class="hdr">
  <h1>CC Hubber</h1>
  <p>Generated ${new Date(generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} &middot; <span id="range-lbl">All time</span></p>
</div>

<!-- Share Card -->
<div class="share-wrap">
  <div class="share-card" id="share-card">
    <div class="sc-top">
      <div>
        <div class="sc-grade">${grade.letter}</div>
        <div class="sc-label">${grade.label}</div>
      </div>
    </div>
    <div class="sc-stats">
      <div>
        <div class="sc-stat-val" id="h-cost">${fmtCost(totalCost)}</div>
        <div class="sc-stat-lbl" id="h-cost-lbl">Total spend</div>
      </div>
      <div>
        <div class="sc-stat-val" id="h-days">${activeDays}</div>
        <div class="sc-stat-lbl">Active days</div>
      </div>
      <div>
        <div class="sc-stat-val">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}</div>
        <div class="sc-stat-lbl">Cache ratio</div>
      </div>
    </div>
    <div class="sc-diagnosis">
      <span>${diagnosisLine}</span>
      <span class="sc-brand"><a href="https://github.com/azkhh/cchubber">CC Hubber</a></span>
    </div>
  </div>
  <div class="share-actions">
    <button class="btn-share" id="btn-png">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg>
      Save as PNG
    </button>
  </div>
</div>

${oauthUsage ? renderRateLimits(oauthUsage) : ''}

${inflection && inflection.multiplier >= 1.5 ? `
<div class="callout">
  <div class="callout-t">Inflection Point</div>
  <div class="callout-d">${inflection.summary}</div>
</div>
` : ''}

<!-- Overview -->
<div class="sect">
  <div class="sect-title">Overview</div>
  <div class="mgrid">
    <div class="mcell">
      <div class="mcell-label">Total cost</div>
      <div class="mcell-val" id="ov-total">${fmtCost(totalCost)}</div>
      <div class="mcell-sub" id="ov-avg">${fmtCost(costAnalysis.avgDailyCost || 0)} avg/day</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Peak day</div>
      <div class="mcell-val">${peakDay ? fmtCost(peakDay.cost) : '$0'}</div>
      <div class="mcell-sub">${peakDay ? peakDay.date : ''}</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Cache health</div>
      <div class="mcell-val" style="color:${grade.color}">${grade.letter}</div>
      <div class="mcell-sub">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : ''}</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Cache breaks</div>
      <div class="mcell-val">${cacheHealth.totalCacheBreaks || 0}</div>
      <div class="mcell-sub">${cacheHealth.reasonsRanked?.[0]?.reason || 'None detected'}</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">CLAUDE.md</div>
      <div class="mcell-val">~${Math.round(claudeMdStack.totalTokensEstimate / 1000)}K</div>
      <div class="mcell-sub">${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB</div>
    </div>
    ${sessionIntel?.available ? `
    <div class="mcell">
      <div class="mcell-label">Sessions</div>
      <div class="mcell-val">${sessionIntel.totalSessions}</div>
      <div class="mcell-sub">${sessionIntel.avgDuration} min avg</div>
    </div>` : `
    <div class="mcell">
      <div class="mcell-label">Sessions</div>
      <div class="mcell-val">${costAnalysis.sessions?.total || 0}</div>
      <div class="mcell-sub">${costAnalysis.sessions?.avgDurationMinutes ? Math.round(costAnalysis.sessions.avgDurationMinutes) + ' min avg' : ''}</div>
    </div>`}
  </div>
</div>

<div class="div"></div>

<!-- Cost Trend -->
<div class="sect">
  <div class="sect-title">Cost Trend</div>
  <div class="chart-wrap">
    <div class="chart-header">
      <div class="chart-filters" id="filters">
        <button class="cfilt" data-r="7">7d</button>
        <button class="cfilt" data-r="30">30d</button>
        <button class="cfilt" data-r="90">90d</button>
        <button class="cfilt on" data-r="all">All</button>
      </div>
      <span id="chart-info"></span>
    </div>
    <svg id="cost-chart-svg" viewBox="0 0 900 180" preserveAspectRatio="xMidYMid meet"></svg>
  </div>
</div>

<div class="div"></div>

<!-- Model Split -->
<div class="sect">
  <div class="sect-title">Models</div>
  <div class="chart-wrap">
    <div class="mbar">
      ${modelEntries.map(([, cost], i) => {
        const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
        const colors = ['#6366f1','#22d3ee','#f59e0b','#22c55e','#8b5cf6','#ef4444'];
        return `<div class="mbar-seg" style="width:${pct}%;background:${colors[i % colors.length]}"></div>`;
      }).join('')}
    </div>
    <div class="mlegend">
      ${modelEntries.map(([name, cost], i) => {
        const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0';
        const colors = ['#6366f1','#22d3ee','#f59e0b','#22c55e','#8b5cf6','#ef4444'];
        return `<div class="mleg-item"><div class="mleg-dot" style="background:${colors[i % colors.length]}"></div><span class="mleg-name">${name}</span><span class="mleg-cost">${fmtCost(cost)}</span><span class="mleg-pct">${pct}%</span></div>`;
      }).join('')}
    </div>
    ${modelRouting?.available ? `
    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);font-size:12px;color:var(--text-3);">
      ${modelRouting.opusPct}% Opus &middot; ${modelRouting.sonnetPct}% Sonnet &middot; ${modelRouting.haikuPct}% Haiku
      ${modelRouting.estimatedSavings > 10 ? `<span style="color:var(--green);margin-left:12px;">~${fmtCost(modelRouting.estimatedSavings)} potential savings with better routing</span>` : ''}
    </div>` : ''}
  </div>
</div>

${sessionIntel?.available ? `
<div class="div"></div>

<!-- Session Intelligence -->
<div class="sect">
  <div class="sect-title">Sessions</div>
  <div class="mgrid">
    <div class="mcell">
      <div class="mcell-label">Median length</div>
      <div class="mcell-val">${sessionIntel.medianDuration}m</div>
      <div class="mcell-sub">p90: ${sessionIntel.p90Duration}m</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Longest</div>
      <div class="mcell-val">${sessionIntel.maxDuration}m</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Long sessions</div>
      <div class="mcell-val">${sessionIntel.longSessions}</div>
      <div class="mcell-sub">${sessionIntel.longSessionPct}% over 60 min</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Avg tools/session</div>
      <div class="mcell-val">${sessionIntel.avgToolsPerSession}</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Lines/hour</div>
      <div class="mcell-val">${sessionIntel.linesPerHour.toLocaleString()}</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Peak overlap</div>
      <div class="mcell-val">${sessionIntel.peakOverlapPct}%</div>
      <div class="mcell-sub">during throttled hours</div>
    </div>
  </div>

  ${sessionIntel.topTools.length > 0 ? `
  <div style="margin-top:16px;">
    <div class="chart-wrap" style="padding:16px 18px;">
      <div style="font-size:11px;color:var(--text-4);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Top tools</div>
      ${sessionIntel.topTools.slice(0, 6).map(t => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;font-size:12px;">
          <span style="width:120px;color:var(--text-3);font-family:var(--mono);font-size:11px;">${t.name}</span>
          <div style="flex:1;height:3px;background:var(--surface-2);border-radius:2px;overflow:hidden;">
            <div style="height:100%;width:${sessionIntel.topTools[0].count > 0 ? (t.count / sessionIntel.topTools[0].count * 100) : 0}%;background:var(--accent);border-radius:2px;"></div>
          </div>
          <span style="width:40px;text-align:right;color:var(--text-4);font-family:var(--mono);font-size:11px;">${t.count}</span>
        </div>
      `).join('')}
    </div>
  </div>` : ''}

  ${sessionIntel.hourDistribution ? `
  <div style="margin-top:16px;">
    <div class="chart-wrap" style="padding:16px 18px;">
      <div style="font-size:11px;color:var(--text-4);text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">Activity by hour</div>
      <div class="hour-grid" id="hour-grid"></div>
      <div class="hour-label"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span></div>
    </div>
  </div>` : ''}
</div>
` : ''}

${projectBreakdown && projectBreakdown.length > 0 ? `
<div class="div"></div>

<!-- Projects -->
<div class="sect">
  <div class="sect-title">Projects</div>
  <div class="chart-wrap" style="padding:0;overflow:hidden;">
    <table class="tbl" id="proj-tbl">
      <thead><tr><th>Project</th><th>Messages</th><th>Sessions</th><th>Output</th><th>Cache Read</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>
` : ''}

${cacheHealth.totalCacheBreaks > 0 ? `
<div class="div"></div>
<div class="sect">
  <div class="sect-title">Cache Break Reasons</div>
  <div class="chart-wrap" style="padding:16px 18px;">
    ${(cacheHealth.reasonsRanked || []).map(r => `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px;">
        <span style="width:180px;color:var(--text-3);">${r.reason}</span>
        <div style="flex:1;height:3px;background:var(--surface-2);border-radius:2px;overflow:hidden;">
          <div style="height:100%;width:${r.percentage}%;background:var(--orange);border-radius:2px;"></div>
        </div>
        <span style="width:28px;text-align:right;color:var(--text-4);font-family:var(--mono);font-size:11px;">${r.count}</span>
      </div>
    `).join('')}
  </div>
</div>
` : ''}

${anomalies.hasAnomalies ? `
<div class="div"></div>
<div class="sect">
  <div class="sect-title">Anomalies</div>
  <div class="chart-wrap" style="padding:0;overflow:hidden;">
    <table class="tbl">
      <thead><tr><th>Date</th><th>Cost</th><th>Deviation</th><th>Cache Ratio</th><th>Severity</th></tr></thead>
      <tbody>
        ${anomalies.anomalies.map(a => `<tr>
          <td class="mono strong">${a.date}</td>
          <td class="mono strong">${fmtCost(a.cost)}</td>
          <td class="mono" style="color:${a.deviation > 0 ? 'var(--red)' : 'var(--green)'}">${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)}</td>
          <td class="mono">${a.cacheOutputRatio ? a.cacheOutputRatio.toLocaleString() + ':1' : ''}</td>
          <td><span class="badge ${a.severity}">${a.severity}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>
` : ''}

${recommendations.length > 0 ? `
<div class="div"></div>
<div class="sect">
  <div class="sect-title">Recommendations</div>
  ${recommendations.map(r => `<div class="rec ${r.severity}"><div class="rec-t">${r.title}</div><div class="rec-d">${r.detail}</div><div class="rec-a">&rarr; ${r.action}</div></div>`).join('')}
</div>
` : ''}

<div class="div"></div>

<!-- CLAUDE.md -->
<div class="sect">
  <div class="sect-title">CLAUDE.md Analysis</div>
  <div class="chart-wrap" style="padding:0;overflow:hidden;">
    <table class="tbl">
      <thead><tr><th>File</th><th>Size</th><th>Tokens</th></tr></thead>
      <tbody>
        ${claudeMdStack.files.map(f => `<tr><td class="strong">${f.level}</td><td class="mono">${(f.bytes / 1024).toFixed(1)} KB</td><td class="mono">${f.tokensEstimate.toLocaleString()}</td></tr>`).join('')}
        <tr><td class="strong">Per-message cost</td><td colspan="2" class="mono">$${claudeMdStack.costPerMessage.cached.toFixed(4)} cached / $${claudeMdStack.costPerMessage.uncached.toFixed(4)} uncached</td></tr>
      </tbody>
    </table>
  </div>
</div>

${cacheHealth.savings?.fromCaching > 0 ? `
<div class="div"></div>
<div class="sect">
  <div class="sect-title">Cache Savings</div>
  <div class="mgrid" style="grid-template-columns:repeat(2,1fr);">
    <div class="mcell">
      <div class="mcell-label">Saved by cache</div>
      <div class="mcell-val" style="color:var(--green)">~$${Number(cacheHealth.savings.fromCaching).toLocaleString()}</div>
      <div class="mcell-sub">vs standard input pricing</div>
    </div>
    <div class="mcell">
      <div class="mcell-label">Wasted on breaks</div>
      <div class="mcell-val" style="color:var(--orange)">~$${Number(cacheHealth.savings.wastedFromBreaks).toLocaleString()}</div>
      <div class="mcell-sub">from cache invalidation</div>
    </div>
  </div>
</div>
` : ''}

<div class="ftr">
  <a href="https://github.com/azkhh/cchubber">CC Hubber</a> &middot; <a href="https://moveros.dev" class="ftr-acc">Mover OS</a>
</div>

</div>

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
        var bg=intensity>0.7?'#6366f1':intensity>0.4?'#6366f180':intensity>0.15?'#6366f140':'#6366f115';
        html+='<div class="hour-cell" style="background:'+bg+'" title="'+i+':00 - '+HR[i]+' messages"></div>';
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
      h+='<tr><td class="strong">'+p.name+(p.path?'<br><span style="font-size:10px;color:var(--text-4);font-family:var(--mono)">'+p.path+'</span>':'')+'</td>';
      h+='<td class="mono">'+p.messages.toLocaleString()+'</td><td class="mono">'+p.sessions+'</td>';
      h+='<td class="mono">'+ft(p.output)+'</td><td class="mono">'+ft(p.cacheRead)+'</td></tr>';
    }
    ptb.innerHTML=h;
  }

  // Chart
  var W=900,H=180,PD={t:20,r:16,b:36,l:52};
  var cW=W-PD.l-PD.r,cH=H-PD.t-PD.b;
  var svg=document.getElementById('cost-chart-svg');
  var tt=document.getElementById('tt'),ttd=document.getElementById('tt-d'),ttc=document.getElementById('tt-c'),tta=document.getElementById('tt-a');

  function filt(r){return r==='all'?D:D.slice(-parseInt(r,10))}

  function chart(d){
    if(!svg)return;
    if(!d.length){svg.innerHTML='<text x="450" y="90" text-anchor="middle" fill="#52525b" font-size="13">No data</text>';return}
    var mx=Math.max.apply(null,d.map(function(x){return x.cost}))*1.1;if(mx<0.01)mx=1;
    var s='';
    // grid
    for(var i=0;i<=3;i++){
      var y=PD.t+(cH/3)*i,v=mx-(mx/3)*i;
      s+='<line x1="'+PD.l+'" y1="'+y+'" x2="'+(W-PD.r)+'" y2="'+y+'" stroke="#1f1f23" stroke-width="1"/>';
      s+='<text x="'+(PD.l-8)+'" y="'+(y+3)+'" text-anchor="end" fill="#52525b" font-size="9" font-family="JetBrains Mono,monospace">$'+(v<1?v.toFixed(2):Math.round(v))+'</text>';
    }
    // area+line
    var step=d.length>1?cW/(d.length-1):0;
    var pts=d.map(function(x,j){return{x:PD.l+(d.length===1?cW/2:j*step),y:PD.t+cH-(x.cost/mx)*cH}});
    var lp='M '+pts[0].x+' '+pts[0].y;
    var ap='M '+pts[0].x+' '+(PD.t+cH)+' L '+pts[0].x+' '+pts[0].y;
    for(var j=1;j<pts.length;j++){var cx=(pts[j-1].x+pts[j].x)/2;lp+=' C '+cx+' '+pts[j-1].y+' '+cx+' '+pts[j].y+' '+pts[j].x+' '+pts[j].y;ap+=' C '+cx+' '+pts[j-1].y+' '+cx+' '+pts[j].y+' '+pts[j].x+' '+pts[j].y}
    ap+=' L '+pts[pts.length-1].x+' '+(PD.t+cH)+' Z';
    s+='<defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366f1" stop-opacity="0.2"/><stop offset="100%" stop-color="#6366f1" stop-opacity="0"/></linearGradient></defs>';
    s+='<path d="'+ap+'" fill="url(#ag)"/>';
    s+='<path d="'+lp+'" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linecap="round"/>';
    // x labels
    var every=Math.max(1,Math.floor(d.length/8));
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step);
      if(j%every===0||j===d.length-1)s+='<text x="'+px+'" y="'+(H-4)+'" text-anchor="middle" fill="#52525b" font-size="8" font-family="JetBrains Mono,monospace">'+x.date.slice(5)+'</text>';
    });
    // anomaly dots
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step),py=PD.t+cH-(x.cost/mx)*cH;
      if(x.isAnomaly)s+='<circle cx="'+px+'" cy="'+py+'" r="3" fill="#ef4444" stroke="#09090b" stroke-width="1.5"/>';
    });
    // hover
    d.forEach(function(x,j){
      var px=PD.l+(d.length===1?cW/2:j*step),py=PD.t+cH-(x.cost/mx)*cH;
      s+='<circle cx="'+px+'" cy="'+py+'" r="14" fill="transparent" data-d="'+x.date+'" data-c="'+x.cost+'" data-a="'+(x.isAnomaly?1:0)+'" class="hov" style="cursor:crosshair"/>';
    });
    svg.innerHTML=s;
    svg.querySelectorAll('.hov').forEach(function(el){
      el.addEventListener('mouseenter',function(e){ttd.textContent=e.target.dataset.d;ttc.textContent=fc(parseFloat(e.target.dataset.c));tta.textContent=e.target.dataset.a==='1'?'anomaly':'';tta.style.display=e.target.dataset.a==='1'?'block':'none';tt.classList.add('on')});
      el.addEventListener('mousemove',function(e){tt.style.left=(e.clientX+12)+'px';tt.style.top=(e.clientY-36)+'px'});
      el.addEventListener('mouseleave',function(){tt.classList.remove('on')});
    });
  }

  var RL={7:'Last 7 days',30:'Last 30 days',90:'Last 90 days',all:'All time'};

  function setR(r){
    var f=filt(r);chart(f);
    var ci=document.getElementById('chart-info');
    if(ci&&f.length){var t=f.reduce(function(s,x){return s+x.cost},0),a=f.filter(function(x){return x.cost>0}).length;ci.textContent=a+' days '+fc(t)}
    var rl=document.getElementById('range-lbl');if(rl)rl.textContent=RL[r]||'All time';
    if(f.length){
      var t=f.reduce(function(s,x){return s+x.cost},0),a=f.filter(function(x){return x.cost>0}).length;
      var hc=document.getElementById('h-cost'),hd=document.getElementById('h-days'),hl=document.getElementById('h-cost-lbl');
      var ot=document.getElementById('ov-total'),oa=document.getElementById('ov-avg');
      if(hc)hc.textContent=fc(t);if(hd)hd.textContent=a;
      if(hl)hl.textContent=(RL[r]||'Total')+' spend';
      if(ot)ot.textContent=fc(t);if(oa&&a>0)oa.textContent=fc(t/a)+' avg/day';
    }
    document.querySelectorAll('.cfilt').forEach(function(b){b.classList.toggle('on',b.dataset.r===r)});
  }

  document.querySelectorAll('.cfilt').forEach(function(b){b.addEventListener('click',function(){setR(b.dataset.r)})});

  // PNG export
  var pb=document.getElementById('btn-png'),toast=document.getElementById('toast');
  if(pb)pb.addEventListener('click',function(){
    var card=document.getElementById('share-card');
    if(!card||typeof html2canvas==='undefined')return;
    pb.textContent='Exporting...';pb.disabled=true;
    html2canvas(card,{backgroundColor:'#111113',scale:2,useCORS:true,logging:false}).then(function(c){
      var a=document.createElement('a');a.download='cchubber.png';a.href=c.toDataURL('image/png');a.click();
      pb.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:12px;height:12px"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/></svg> Save as PNG';
      pb.disabled=false;showToast('Saved');
    }).catch(function(){pb.textContent='Save as PNG';pb.disabled=false;showToast('Failed')});
  });

  function showToast(m){if(!toast)return;toast.textContent=m;toast.classList.add('on');setTimeout(function(){toast.classList.remove('on')},1500)}

  setR('all');
})();
</script>
</body>
</html>`;
}

function renderRateLimits(usage) {
  const fiveHour = usage.five_hour;
  const sevenDay = usage.seven_day;
  if (!fiveHour && !sevenDay) return '';

  const fivePct = fiveHour?.utilization ?? 0;
  const sevenPct = sevenDay?.utilization ?? 0;
  const fiveColor = fivePct > 80 ? 'var(--red)' : fivePct > 50 ? 'var(--yellow)' : 'var(--green)';
  const sevenColor = sevenPct > 80 ? 'var(--red)' : sevenPct > 50 ? 'var(--yellow)' : 'var(--green)';

  return `
  <div class="sect" style="margin-bottom:32px;">
    <div class="sect-title">Rate Limits</div>
    <div class="mgrid" style="grid-template-columns:repeat(2,1fr);">
      <div class="mcell">
        <div class="mcell-label">5-hour session</div>
        <div class="mcell-val" style="color:${fiveColor}">${fivePct}%</div>
        <div class="rate-bg"><div class="rate-fill" style="width:${fivePct}%;background:${fiveColor}"></div></div>
        <div class="mcell-sub">${fiveHour?.resets_at ? 'Resets ' + new Date(fiveHour.resets_at).toLocaleTimeString() : ''}</div>
      </div>
      <div class="mcell">
        <div class="mcell-label">7-day rolling</div>
        <div class="mcell-val" style="color:${sevenColor}">${sevenPct}%</div>
        <div class="rate-bg"><div class="rate-fill" style="width:${sevenPct}%;background:${sevenColor}"></div></div>
        <div class="mcell-sub">${sevenDay?.resets_at ? 'Resets ' + new Date(sevenDay.resets_at).toLocaleDateString() : ''}</div>
      </div>
    </div>
  </div>
  <div class="div"></div>`;
}
