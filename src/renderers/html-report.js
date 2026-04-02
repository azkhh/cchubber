export function renderHTML(report) {
  const { costAnalysis, cacheHealth, anomalies, inflection, projectBreakdown, claudeMdStack, oauthUsage, recommendations, generatedAt } = report;

  const dailyCosts = costAnalysis.dailyCosts || [];
  const grade = cacheHealth.grade || { letter: '?', color: '#666', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;
  const activeDays = costAnalysis.activeDays || 0;
  const peakDay = costAnalysis.peakDay;

  // Model split data
  const modelCosts = costAnalysis.modelCosts || {};
  const modelEntries = Object.entries(modelCosts)
    .filter(([, cost]) => cost > 0.01)
    .sort((a, b) => b[1] - a[1]);
  const modelColors = [
    ['#6366f1', '#818cf8'],
    ['#22d3ee', '#67e8f9'],
    ['#f59e0b', '#fcd34d'],
    ['#10b981', '#34d399'],
    ['#8b5cf6', '#a78bfa'],
    ['#ef4444', '#f87171'],
  ];

  // Anomaly dates for chart markers
  const anomalyDates = new Set((anomalies.anomalies || []).map(a => a.date));

  // Embed all daily cost data as JSON for client-side filtering
  const dailyCostsJSON = JSON.stringify(dailyCosts.map(d => ({
    date: d.date,
    cost: d.cost,
    cacheOutputRatio: d.cacheOutputRatio || 0,
    isAnomaly: anomalyDates.has(d.date),
  })));

  // Per-project data for client-side rendering
  const projectsJSON = JSON.stringify((projectBreakdown || []).slice(0, 15).map(p => ({
    name: p.name,
    path: p.path,
    messages: p.messageCount,
    sessions: p.sessionCount,
    input: p.inputTokens,
    output: p.outputTokens,
    cacheRead: p.cacheReadTokens,
    cacheWrite: p.cacheCreationTokens,
  })));

  // Format helpers
  const fmtCost = (n) => '$' + (n >= 100 ? Math.round(n).toLocaleString() : n.toFixed(2));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CC Hubber — Usage Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0a0e17;
    --bg-card: rgba(15, 20, 32, 0.65);
    --bg-card-solid: #0f1420;
    --border: rgba(255, 255, 255, 0.06);
    --border-strong: rgba(255, 255, 255, 0.1);
    --text: #e8ecf2;
    --text-secondary: #b8c4d4;
    --text-muted: #8896aa;
    --text-dim: #596678;
    --accent: #7c85f5;
    --accent-soft: rgba(124, 133, 245, 0.08);
    --green: #34d399;
    --yellow: #fbbf24;
    --red: #f87171;
    --cyan: #67e8f9;
    --orange: #fb923c;
    --radius: 14px;
    --radius-sm: 8px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .container {
    max-width: 1080px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 48px;
  }

  .header h1 {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
    color: var(--text);
  }

  .header .tagline {
    color: var(--text-muted);
    font-size: 14px;
    font-weight: 400;
  }

  .header .generated {
    color: var(--text-dim);
    font-size: 11px;
    margin-top: 8px;
    font-weight: 400;
  }

  /* Section */
  .section { margin-bottom: 36px; }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1.2px;
    margin-bottom: 14px;
  }

  /* Cards */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: border-color 0.2s;
  }

  .card:hover { border-color: var(--border-strong); }

  .card .label {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 4px;
  }

  .card .value {
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .card .sub {
    font-size: 12px;
    font-weight: 400;
    color: var(--text-dim);
    margin-top: 3px;
  }

  /* Share Card (Hero) */
  .share-card-wrapper {
    margin-bottom: 44px;
  }

  .share-card {
    width: 100%;
    background: linear-gradient(145deg, #0c1120 0%, #0f1628 50%, #0b1020 100%);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 44px 48px;
    position: relative;
    overflow: hidden;
  }

  .share-card::before {
    content: '';
    position: absolute;
    top: -40%;
    right: -15%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, ${grade.color}0c 0%, transparent 60%);
    pointer-events: none;
  }

  .share-card-inner {
    position: relative;
    z-index: 1;
  }

  .share-card .grade-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  .share-card .grade-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 18px;
    background: ${grade.color}14;
    border: 1.5px solid ${grade.color}40;
    font-size: 40px;
    font-weight: 800;
    color: ${grade.color};
    letter-spacing: -1px;
  }

  .share-card .grade-info { }

  .share-card .grade-label {
    color: ${grade.color};
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    display: block;
  }

  .share-card .grade-desc {
    color: var(--text-muted);
    font-size: 13px;
    font-weight: 400;
    margin-top: 2px;
  }

  .share-card .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    margin-bottom: 28px;
  }

  .share-card .stat {
    text-align: center;
    padding: 0 20px;
    border-right: 1px solid var(--border);
  }

  .share-card .stat:first-child { padding-left: 0; }
  .share-card .stat:last-child  { border-right: none; }

  .share-card .stat-value {
    font-size: 38px;
    font-weight: 800;
    letter-spacing: -1.5px;
    line-height: 1;
    margin-bottom: 4px;
  }

  .share-card .stat-label {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .share-card .branding {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .share-card .brand-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text);
  }

  .share-card .brand-sub {
    font-size: 11px;
    color: var(--text-dim);
    font-weight: 400;
  }

  /* Share button */
  .share-btn-row {
    display: flex;
    justify-content: center;
    margin-top: 16px;
  }

  .share-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 20px;
    background: rgba(124, 133, 245, 0.1);
    border: 1px solid rgba(124, 133, 245, 0.25);
    border-radius: 8px;
    color: var(--accent);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .share-btn:hover {
    background: rgba(124, 133, 245, 0.18);
    border-color: rgba(124, 133, 245, 0.4);
  }

  .share-btn:active { transform: scale(0.97); }

  .share-btn svg { width: 14px; height: 14px; }

  /* Inflection callout */
  .inflection-card {
    background: rgba(251, 146, 60, 0.06);
    border: 1px solid rgba(251, 146, 60, 0.15);
    border-left: 3px solid var(--orange);
    border-radius: var(--radius);
    padding: 18px 22px;
    margin-bottom: 36px;
  }

  .inflection-card .inflection-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--orange);
    margin-bottom: 4px;
  }

  .inflection-card .inflection-detail {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary);
  }

  /* Chart */
  .chart-container {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
  }

  .chart-controls {
    display: flex;
    gap: 6px;
    margin-bottom: 16px;
  }

  .chart-btn {
    padding: 4px 12px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .chart-btn:hover {
    border-color: rgba(124, 133, 245, 0.3);
    color: var(--text-muted);
  }

  .chart-btn.active {
    background: rgba(124, 133, 245, 0.12);
    border-color: rgba(124, 133, 245, 0.35);
    color: #a5b4fc;
  }

  #cost-chart-svg {
    width: 100%;
    overflow: visible;
  }

  /* Tooltip */
  .chart-tooltip {
    position: fixed;
    background: #0f1a2b;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 100;
    white-space: nowrap;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }

  .chart-tooltip.visible { opacity: 1; }

  .chart-tooltip .tt-date {
    font-weight: 500;
    color: var(--text-muted);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }

  .chart-tooltip .tt-cost {
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.3px;
  }

  .chart-tooltip .tt-anomaly {
    font-size: 11px;
    color: var(--red);
    margin-top: 2px;
  }

  /* Model Split */
  .model-bar {
    display: flex;
    height: 36px;
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 16px;
    gap: 2px;
    box-shadow: inset 0 1px 4px rgba(0,0,0,0.2);
  }

  .model-bar-segment {
    height: 100%;
    transition: opacity 0.2s;
    cursor: default;
  }

  .model-bar-segment:first-child { border-radius: 10px 0 0 10px; }
  .model-bar-segment:last-child  { border-radius: 0 10px 10px 0; }
  .model-bar-segment:only-child  { border-radius: 10px; }
  .model-bar-segment:hover { opacity: 0.8; }

  .model-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 20px;
  }

  .model-legend-item {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 400;
  }

  .model-legend-item .model-name { color: var(--text-muted); }
  .model-legend-item .model-cost { font-weight: 600; }
  .model-legend-item .model-pct { color: var(--text-dim); font-size: 12px; }
  .model-legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

  /* Project breakdown */
  .project-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .project-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }

  .project-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    font-weight: 400;
  }

  .project-table tr:last-child td { border-bottom: none; }
  .project-table tbody tr:hover td { background: rgba(255,255,255,0.015); }

  .project-name {
    font-weight: 500;
    color: var(--text);
  }

  .project-path {
    font-size: 11px;
    color: var(--text-dim);
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  }

  /* Recommendations */
  .rec-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 22px;
    margin-bottom: 10px;
    border-left: 3px solid;
  }

  .rec-card.critical {
    border-left-color: var(--red);
    background: rgba(239, 68, 68, 0.03);
  }

  .rec-card.warning {
    border-left-color: var(--yellow);
    background: rgba(245, 158, 11, 0.03);
  }

  .rec-card.info {
    border-left-color: var(--cyan);
    background: rgba(34, 211, 238, 0.02);
  }

  .rec-card.positive {
    border-left-color: var(--green);
    background: rgba(16, 185, 129, 0.03);
  }

  .rec-title {
    font-weight: 600;
    font-size: 13px;
    margin-bottom: 4px;
  }

  .rec-detail {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .rec-action {
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }

  /* Rate Limits */
  .rate-bar-bg {
    height: 5px;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
    overflow: hidden;
    margin: 8px 0 4px;
  }

  .rate-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  /* Cache Break Reasons */
  .reason-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .reason-row .reason-name {
    width: 200px;
    flex-shrink: 0;
    font-weight: 400;
    color: var(--text-muted);
  }

  .reason-row .reason-fill-bg {
    flex: 1;
    height: 4px;
    background: rgba(255,255,255,0.04);
    border-radius: 2px;
    overflow: hidden;
  }

  .reason-row .reason-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--orange), #fbbf24);
    border-radius: 2px;
  }

  .reason-row .reason-count {
    width: 32px;
    text-align: right;
    font-weight: 400;
    color: var(--text-dim);
    font-size: 12px;
  }

  /* Anomaly Table */
  .anomaly-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .anomaly-table th {
    text-align: left;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }

  .anomaly-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .anomaly-table tr:last-child td { border-bottom: none; }
  .anomaly-table tbody tr:hover td { background: rgba(255,255,255,0.015); }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .badge.critical { background: rgba(239, 68, 68, 0.12); color: #f87171; }
  .badge.warning { background: rgba(245, 158, 11, 0.12); color: #fbbf24; }
  .badge.spike { background: rgba(249, 115, 22, 0.12); color: #fb923c; }

  /* CLAUDE.md */
  .claudemd-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  .claudemd-row:last-of-type { border-bottom: none; }
  .claudemd-row .row-label { font-weight: 400; color: var(--text-muted); }
  .claudemd-row .row-value { font-weight: 500; color: var(--text); }

  /* Footer */
  .footer {
    text-align: center;
    padding-top: 48px;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 400;
  }

  .footer a { color: var(--text-dim); text-decoration: none; transition: color 0.2s; }
  .footer a:hover { color: var(--text-muted); }
  .footer .accent-link { color: var(--accent); font-weight: 500; }
  .footer .accent-link:hover { color: #a5b4fc; }
  .footer-tagline { margin-top: 6px; }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border), transparent);
    margin: 0 0 36px;
  }

  #filter-summary {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 400;
    margin-left: auto;
  }

  #range-label {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 400;
  }

  /* Share toast */
  .toast {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(80px);
    background: #1a2236;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 10px 20px;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    opacity: 0;
    transition: all 0.3s;
    z-index: 200;
    pointer-events: none;
  }

  .toast.show {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
</style>
</head>
<body>

<div class="chart-tooltip" id="chart-tooltip">
  <div class="tt-date" id="tt-date"></div>
  <div class="tt-cost" id="tt-cost"></div>
  <div class="tt-anomaly" id="tt-anomaly"></div>
</div>

<div class="toast" id="toast">Image saved!</div>

<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>CC Hubber</h1>
    <div class="tagline">What you spent. Why you spent it. Is that normal.</div>
    <div class="generated">Generated ${new Date(generatedAt).toLocaleString()} &mdash; <span id="range-label">All time</span></div>
  </div>

  <!-- Hero / Shareable Card -->
  <div class="share-card-wrapper">
    <div class="share-card" id="share-card">
      <div class="share-card-inner">
        <div class="grade-row">
          <div class="grade-badge">${grade.letter}</div>
          <div class="grade-info">
            <span class="grade-label">Cache Health: ${grade.label}</span>
            <span class="grade-desc">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1 cache-to-output ratio' : 'No data'}</span>
          </div>
        </div>
        <div class="stats-row">
          <div class="stat">
            <div class="stat-value" id="hero-cost">${fmtCost(totalCost)}</div>
            <div class="stat-label" id="hero-cost-label">Total Spend</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="hero-days">${activeDays}</div>
            <div class="stat-label">Active Days</div>
          </div>
          <div class="stat">
            <div class="stat-value">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}</div>
            <div class="stat-label">Cache Ratio</div>
          </div>
        </div>
        <div class="branding">
          <div>
            <div class="brand-name">CC Hubber</div>
            <div class="brand-sub"><a href="https://github.com/azkhh/cchubber" target="_blank" style="color:var(--text-dim);text-decoration:none;">github.com/azkhh/cchubber</a></div>
          </div>
          <div class="brand-sub">Shipped with <a href="https://moveros.dev" target="_blank" style="color:var(--accent);font-weight:500;text-decoration:none;">Mover OS</a></div>
        </div>
      </div>
    </div>
    <div class="share-btn-row">
      <button class="share-btn" id="share-btn">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
        Export as image
      </button>
    </div>
  </div>

  ${oauthUsage ? renderRateLimits(oauthUsage) : ''}

  ${inflection && inflection.multiplier >= 1.5 ? `
  <!-- Inflection Point -->
  <div class="inflection-card">
    <div class="inflection-title">Inflection Point Detected</div>
    <div class="inflection-detail">${inflection.summary}</div>
  </div>
  ` : ''}

  <!-- Overview Cards -->
  <div class="section">
    <div class="section-title">Overview</div>
    <div class="grid">
      <div class="card">
        <div class="label">Total Cost</div>
        <div class="value" id="ov-total">${fmtCost(totalCost)}</div>
        <div class="sub" id="ov-avg">$${(costAnalysis.avgDailyCost || 0).toFixed(2)} avg/day</div>
      </div>
      <div class="card">
        <div class="label">Peak Day</div>
        <div class="value">${peakDay ? fmtCost(peakDay.cost) : '$0'}</div>
        <div class="sub">${peakDay ? peakDay.date : 'N/A'}</div>
      </div>
      <div class="card">
        <div class="label">Cache Health</div>
        <div class="value" style="color: ${grade.color}">${grade.letter}</div>
        <div class="sub">${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1 ratio' : 'N/A'}</div>
      </div>
      <div class="card">
        <div class="label">Cache Breaks</div>
        <div class="value">${cacheHealth.totalCacheBreaks || 0}</div>
        <div class="sub">${cacheHealth.reasonsRanked?.[0] ? 'Top: ' + cacheHealth.reasonsRanked[0].reason : 'None detected'}</div>
      </div>
      <div class="card">
        <div class="label">CLAUDE.md</div>
        <div class="value">~${claudeMdStack.totalTokensEstimate.toLocaleString()}</div>
        <div class="sub">tokens &mdash; ${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB</div>
      </div>
      <div class="card">
        <div class="label">Sessions</div>
        <div class="value">${costAnalysis.sessions?.total || 0}</div>
        <div class="sub">${costAnalysis.sessions?.avgDurationMinutes ? Math.round(costAnalysis.sessions.avgDurationMinutes) + ' min avg' : ''}</div>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Daily Cost Trend -->
  <div class="section">
    <div class="section-title">Daily Cost Trend</div>
    <div class="chart-container">
      <div style="display:flex;align-items:center;gap:0;margin-bottom:16px;">
        <div class="chart-controls" id="range-controls">
          <button class="chart-btn" data-range="7">7d</button>
          <button class="chart-btn" data-range="30">30d</button>
          <button class="chart-btn" data-range="90">90d</button>
          <button class="chart-btn active" data-range="all">All</button>
        </div>
        <span id="filter-summary"></span>
      </div>
      <div id="chart-area">
        <svg id="cost-chart-svg" viewBox="0 0 1000 220" preserveAspectRatio="xMidYMid meet" style="width:100%;overflow:visible;display:block;"></svg>
      </div>
    </div>
  </div>

  <div class="divider"></div>

  <!-- Model Split -->
  <div class="section">
    <div class="section-title">Model Cost Split</div>
    <div class="chart-container">
      <div class="model-bar">
        ${modelEntries.map(([name, cost], i) => {
          const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
          const colors = modelColors[i % modelColors.length];
          return `<div class="model-bar-segment" style="width:${pct}%;background:linear-gradient(135deg,${colors[0]},${colors[1]})" title="${name}: $${cost.toFixed(2)} (${pct.toFixed(1)}%)"></div>`;
        }).join('')}
      </div>
      <div class="model-legend">
        ${modelEntries.map(([name, cost], i) => {
          const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0';
          const colors = modelColors[i % modelColors.length];
          return `<div class="model-legend-item">
            <div class="model-legend-dot" style="background:linear-gradient(135deg,${colors[0]},${colors[1]})"></div>
            <span class="model-name">${name}</span>
            <span class="model-cost">$${cost.toFixed(2)}</span>
            <span class="model-pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>
    </div>
  </div>

  ${projectBreakdown && projectBreakdown.length > 0 ? `
  <div class="divider"></div>

  <!-- Per-Project Breakdown -->
  <div class="section">
    <div class="section-title">Projects</div>
    <div class="chart-container" style="overflow-x:auto;">
      <table class="project-table" id="project-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Messages</th>
            <th>Sessions</th>
            <th>Output Tokens</th>
            <th>Cache Read</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  ` : ''}

  ${cacheHealth.totalCacheBreaks > 0 ? `
  <div class="divider"></div>

  <!-- Cache Break Reasons -->
  <div class="section">
    <div class="section-title">Cache Break Reasons</div>
    <div class="chart-container">
      ${(cacheHealth.reasonsRanked || []).map(r => `
        <div class="reason-row">
          <span class="reason-name">${r.reason}</span>
          <div class="reason-fill-bg">
            <div class="reason-fill" style="width:${r.percentage}%"></div>
          </div>
          <span class="reason-count">${r.count}</span>
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

  ${anomalies.hasAnomalies ? `
  <div class="divider"></div>

  <!-- Anomalies -->
  <div class="section">
    <div class="section-title">Anomalies Detected</div>
    <div class="chart-container" style="padding:0;overflow:hidden;">
      <table class="anomaly-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Cost</th>
            <th>Deviation</th>
            <th>Cache Ratio</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          ${anomalies.anomalies.map(a => `
            <tr>
              <td style="font-weight:500;">${a.date}</td>
              <td style="font-weight:600;">$${a.cost.toFixed(2)}</td>
              <td style="color:${a.deviation > 0 ? 'var(--red)' : 'var(--green)'};font-weight:500;">${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)}</td>
              <td style="color:var(--text-muted);">${a.cacheOutputRatio ? a.cacheOutputRatio.toLocaleString() + ':1' : 'N/A'}</td>
              <td><span class="badge ${a.severity}">${a.severity}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ` : ''}

  ${recommendations.length > 0 ? `
  <div class="divider"></div>

  <!-- Recommendations -->
  <div class="section">
    <div class="section-title">Recommendations</div>
    ${recommendations.map(r => `
      <div class="rec-card ${r.severity}">
        <div class="rec-title">${r.title}</div>
        <div class="rec-detail">${r.detail}</div>
        <div class="rec-action">&rarr; ${r.action}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <div class="divider"></div>

  <!-- CLAUDE.md Stack -->
  <div class="section">
    <div class="section-title">CLAUDE.md Analysis</div>
    <div class="chart-container">
      ${claudeMdStack.files.map(f => `
        <div class="claudemd-row">
          <span class="row-label">${f.level}</span>
          <span class="row-value">${(f.bytes / 1024).toFixed(1)} KB &mdash; ~${f.tokensEstimate.toLocaleString()} tokens</span>
        </div>
      `).join('')}
      <div class="claudemd-row" style="margin-top:6px;">
        <span class="row-label" style="color:var(--text);font-weight:500;">Per-message cost</span>
        <span class="row-value">$${claudeMdStack.costPerMessage.cached.toFixed(4)} cached / $${claudeMdStack.costPerMessage.uncached.toFixed(4)} uncached</span>
      </div>
    </div>
  </div>

  ${cacheHealth.savings?.fromCaching ? `
  <div class="divider"></div>

  <div class="section">
    <div class="section-title">Cache Savings</div>
    <div class="grid">
      <div class="card">
        <div class="label">Saved by Cache</div>
        <div class="value" style="color:var(--green)">~$${Number(cacheHealth.savings.fromCaching).toLocaleString()}</div>
        <div class="sub">vs standard input pricing</div>
      </div>
      <div class="card">
        <div class="label">Wasted on Breaks</div>
        <div class="value" style="color:var(--orange)">~$${Number(cacheHealth.savings.wastedFromBreaks).toLocaleString()}</div>
        <div class="sub">from cache invalidation</div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>CC Hubber &mdash; <a href="https://github.com/azkhh/cchubber" target="_blank">github.com/azkhh/cchubber</a></div>
    <div class="footer-tagline">Shipped with <a href="https://moveros.dev" target="_blank" class="accent-link">Mover OS</a></div>
  </div>

</div>

<!-- html2canvas for share card export -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>

<script>
(function() {
  'use strict';

  var ALL_DATA = ${dailyCostsJSON};
  var PROJECTS = ${projectsJSON};

  // ─── Pricing helper (client-side cost estimation for projects) ───
  // Simplified: use Opus cache read rate as dominant cost component
  var CACHE_READ_PER_M = 0.50;
  var OUTPUT_PER_M = 25;
  var INPUT_PER_M = 5;
  var CACHE_WRITE_PER_M = 6.25;

  function estimateCost(p) {
    return (p.input / 1e6 * INPUT_PER_M) +
           (p.output / 1e6 * OUTPUT_PER_M) +
           (p.cacheRead / 1e6 * CACHE_READ_PER_M) +
           (p.cacheWrite / 1e6 * CACHE_WRITE_PER_M);
  }

  // ─── Format helpers ───
  function fmtCostJS(n) {
    if (n >= 100) return '$' + Math.round(n).toLocaleString();
    return '$' + n.toFixed(2);
  }

  function fmtTokens(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
  }

  // ─── Render project table ───
  function renderProjectTable() {
    var tbody = document.querySelector('#project-table tbody');
    if (!tbody || PROJECTS.length === 0) return;

    // Sort by estimated cost desc
    var sorted = PROJECTS.slice().sort(function(a, b) {
      return estimateCost(b) - estimateCost(a);
    });

    var html = '';
    for (var i = 0; i < Math.min(sorted.length, 10); i++) {
      var p = sorted[i];
      var cost = estimateCost(p);
      html += '<tr>';
      html += '<td><div class="project-name">' + p.name + '</div>';
      if (p.path) html += '<div class="project-path">' + p.path + '</div>';
      html += '</td>';
      html += '<td>' + p.messages.toLocaleString() + '</td>';
      html += '<td>' + p.sessions + '</td>';
      html += '<td>' + fmtTokens(p.output) + '</td>';
      html += '<td>' + fmtTokens(p.cacheRead) + '</td>';
      html += '</tr>';
    }

    tbody.innerHTML = html;
  }

  renderProjectTable();

  // ─── Chart renderer ───
  var W = 1000, H = 220;
  var PAD = { top: 24, right: 24, bottom: 44, left: 64 };
  var chartW = W - PAD.left - PAD.right;
  var chartH = H - PAD.top - PAD.bottom;

  var svg = document.getElementById('cost-chart-svg');
  var tooltip = document.getElementById('chart-tooltip');
  var ttDate = document.getElementById('tt-date');
  var ttCost = document.getElementById('tt-cost');
  var ttAnomaly = document.getElementById('tt-anomaly');

  function getFilteredData(range) {
    if (range === 'all' || !range) return ALL_DATA;
    var days = parseInt(range, 10);
    if (!days || isNaN(days)) return ALL_DATA;
    return ALL_DATA.slice(-days);
  }

  function buildAreaPath(data, maxCost) {
    if (data.length === 0) return null;
    var step = chartW / Math.max(data.length - 1, 1);
    var points = data.map(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var y = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      return { x: x, y: y };
    });

    var linePath = '';
    var areaPath = '';
    var baseY = PAD.top + chartH;

    if (points.length === 1) {
      linePath = 'M ' + points[0].x + ' ' + points[0].y;
      areaPath = 'M ' + points[0].x + ' ' + baseY + ' L ' + points[0].x + ' ' + points[0].y + ' Z';
    } else {
      linePath = 'M ' + points[0].x + ' ' + points[0].y;
      for (var i = 1; i < points.length; i++) {
        var prev = points[i - 1];
        var curr = points[i];
        var cpx = (prev.x + curr.x) / 2;
        linePath += ' C ' + cpx + ' ' + prev.y + ' ' + cpx + ' ' + curr.y + ' ' + curr.x + ' ' + curr.y;
      }
      areaPath = 'M ' + points[0].x + ' ' + baseY + ' L ' + points[0].x + ' ' + points[0].y;
      for (var j = 1; j < points.length; j++) {
        var pp = points[j - 1];
        var cp = points[j];
        var cpxj = (pp.x + cp.x) / 2;
        areaPath += ' C ' + cpxj + ' ' + pp.y + ' ' + cpxj + ' ' + cp.y + ' ' + cp.x + ' ' + cp.y;
      }
      areaPath += ' L ' + points[points.length - 1].x + ' ' + baseY + ' Z';
    }

    return { linePath: linePath, areaPath: areaPath, points: points };
  }

  function renderChart(data) {
    if (!svg) return;

    if (data.length === 0) {
      svg.innerHTML = '<text x="500" y="110" text-anchor="middle" fill="#475569" font-size="14">No data for this range</text>';
      return;
    }

    var maxCost = Math.max.apply(null, data.map(function(d) { return d.cost; }));
    maxCost = maxCost * 1.12;
    if (maxCost < 0.01) maxCost = 1;

    var paths = buildAreaPath(data, maxCost);
    if (!paths) return;
    var gradId = 'areaGrad';

    var html = '';

    html += '<defs>';
    html += '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">';
    html += '<stop offset="0%" stop-color="#6366f1" stop-opacity="0.3"/>';
    html += '<stop offset="60%" stop-color="#6366f1" stop-opacity="0.06"/>';
    html += '<stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>';
    html += '</linearGradient>';
    html += '</defs>';

    // Grid lines
    var yTicks = 4;
    for (var i = 0; i <= yTicks; i++) {
      var y = PAD.top + (chartH / yTicks) * i;
      var val = maxCost - (maxCost / yTicks) * i;
      html += '<line x1="' + PAD.left + '" y1="' + y + '" x2="' + (W - PAD.right) + '" y2="' + y + '" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>';
      html += '<text x="' + (PAD.left - 10) + '" y="' + (y + 4) + '" text-anchor="end" fill="#475569" font-size="10" font-family="system-ui,sans-serif">$' + (val < 1 ? val.toFixed(2) : val.toFixed(0)) + '</text>';
    }

    html += '<line x1="' + PAD.left + '" y1="' + (PAD.top + chartH) + '" x2="' + (W - PAD.right) + '" y2="' + (PAD.top + chartH) + '" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>';

    // Area + line
    html += '<path d="' + paths.areaPath + '" fill="url(#' + gradId + ')"/>';
    html += '<path d="' + paths.linePath + '" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

    // X labels
    var step = data.length > 1 ? chartW / (data.length - 1) : 0;
    var showEvery = Math.max(1, Math.floor(data.length / 10));
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      if (i % showEvery === 0 || i === data.length - 1) {
        html += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#475569" font-size="9" font-family="system-ui,sans-serif">' + d.date.slice(5) + '</text>';
      }
    });

    // Anomaly dots
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var yy = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      if (d.isAnomaly) {
        html += '<circle cx="' + x + '" cy="' + yy + '" r="4" fill="#ef4444" stroke="#0a0e17" stroke-width="1.5"/>';
      }
    });

    // Hover targets
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var yy = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      html += '<circle cx="' + x + '" cy="' + yy + '" r="16" fill="transparent"';
      html += ' data-date="' + d.date + '" data-cost="' + d.cost + '" data-anomaly="' + (d.isAnomaly ? '1' : '0') + '"';
      html += ' class="chart-hover-target" style="cursor:pointer;"/>';
    });

    svg.innerHTML = html;

    svg.querySelectorAll('.chart-hover-target').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        ttDate.textContent = e.target.dataset.date;
        ttCost.textContent = fmtCostJS(parseFloat(e.target.dataset.cost));
        ttAnomaly.textContent = e.target.dataset.anomaly === '1' ? 'Anomaly' : '';
        ttAnomaly.style.display = e.target.dataset.anomaly === '1' ? 'block' : 'none';
        tooltip.classList.add('visible');
      });
      el.addEventListener('mousemove', function(e) {
        tooltip.style.left = (e.clientX + 16) + 'px';
        tooltip.style.top  = (e.clientY - 40) + 'px';
      });
      el.addEventListener('mouseleave', function() {
        tooltip.classList.remove('visible');
      });
    });
  }

  // ─── Range filter + dynamic headline ───
  var RANGE_LABELS = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', 'all': 'All time' };

  function updateFilterSummary(data) {
    var el = document.getElementById('filter-summary');
    if (!el) return;
    if (!data || data.length === 0) { el.textContent = ''; return; }
    var total = data.reduce(function(s, d) { return s + d.cost; }, 0);
    var active = data.filter(function(d) { return d.cost > 0; }).length;
    el.textContent = active + ' active days · ' + fmtCostJS(total);
  }

  function setRange(range) {
    var filtered = getFilteredData(range);
    renderChart(filtered);
    updateFilterSummary(filtered);

    // Update range label in header
    var rangeLabel = document.getElementById('range-label');
    if (rangeLabel) rangeLabel.textContent = RANGE_LABELS[range] || 'All time';

    // Update hero + overview with filtered data
    if (filtered.length > 0) {
      var totalFiltered = filtered.reduce(function(s, d) { return s + d.cost; }, 0);
      var activeDaysFiltered = filtered.filter(function(d) { return d.cost > 0; }).length;
      var heroCost = document.getElementById('hero-cost');
      var heroDays = document.getElementById('hero-days');
      var heroCostLabel = document.getElementById('hero-cost-label');
      var ovTotal = document.getElementById('ov-total');
      var ovAvg = document.getElementById('ov-avg');
      if (heroCost) heroCost.textContent = fmtCostJS(totalFiltered);
      if (heroDays) heroDays.textContent = activeDaysFiltered;
      if (heroCostLabel) heroCostLabel.textContent = RANGE_LABELS[range] ? RANGE_LABELS[range] + ' Spend' : 'Total Spend';
      if (ovTotal) ovTotal.textContent = fmtCostJS(totalFiltered);
      if (ovAvg && activeDaysFiltered > 0) ovAvg.textContent = fmtCostJS(totalFiltered / activeDaysFiltered) + ' avg/day';
    }

    document.querySelectorAll('.chart-btn[data-range]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.range === range);
    });
  }

  document.querySelectorAll('.chart-btn[data-range]').forEach(function(btn) {
    btn.addEventListener('click', function() { setRange(btn.dataset.range); });
  });

  // ─── Share/Export PNG ───
  var shareBtn = document.getElementById('share-btn');
  var toast = document.getElementById('toast');

  if (shareBtn) {
    shareBtn.addEventListener('click', function() {
      var card = document.getElementById('share-card');
      if (!card || typeof html2canvas === 'undefined') {
        showToast('html2canvas failed to load');
        return;
      }

      shareBtn.textContent = 'Exporting...';
      shareBtn.disabled = true;

      html2canvas(card, {
        backgroundColor: '#0a0e17',
        scale: 2,
        useCORS: true,
        logging: false,
        width: card.offsetWidth,
        height: card.offsetHeight,
      }).then(function(canvas) {
        // Create download link
        var link = document.createElement('a');
        link.download = 'cchubber-report.png';
        link.href = canvas.toDataURL('image/png');
        link.click();

        shareBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg> Export as image';
        shareBtn.disabled = false;
        showToast('Image saved!');
      }).catch(function() {
        shareBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg> Export as image';
        shareBtn.disabled = false;
        showToast('Export failed');
      });
    });
  }

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(function() { toast.classList.remove('show'); }, 2000);
  }

  // Initial render
  setRange('all');
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
  <div class="section" style="margin-bottom:36px;">
    <div class="section-title">Live Rate Limits</div>
    <div class="grid">
      <div class="card">
        <div class="label">5-Hour Session</div>
        <div class="value" style="color:${fiveColor}">${fivePct}%</div>
        <div class="rate-bar-bg">
          <div class="rate-bar-fill" style="width:${fivePct}%;background:${fiveColor};"></div>
        </div>
        <div class="sub">${fiveHour?.resets_at ? 'Resets ' + new Date(fiveHour.resets_at).toLocaleTimeString() : ''}</div>
      </div>
      <div class="card">
        <div class="label">7-Day Rolling</div>
        <div class="value" style="color:${sevenColor}">${sevenPct}%</div>
        <div class="rate-bar-bg">
          <div class="rate-bar-fill" style="width:${sevenPct}%;background:${sevenColor};"></div>
        </div>
        <div class="sub">${sevenDay?.resets_at ? 'Resets ' + new Date(sevenDay.resets_at).toLocaleDateString() : ''}</div>
      </div>
    </div>
    <div style="height:36px;"></div>
    <div class="divider" style="margin-bottom:0;"></div>
  </div>`;
}
