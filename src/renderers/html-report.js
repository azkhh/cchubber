export function renderHTML(report) {
  const { costAnalysis, cacheHealth, anomalies, claudeMdStack, oauthUsage, recommendations, generatedAt } = report;

  const dailyCosts = costAnalysis.dailyCosts || [];
  const grade = cacheHealth.grade || { letter: '?', color: '#666', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;
  const activeDays = costAnalysis.activeDays || 0;
  const peakDay = costAnalysis.peakDay;

  // Model split data — filter out zero-cost entries
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

  // Format helpers (server-side, for initial render)
  const fmt = (n) => n >= 1000 ? n.toLocaleString() : n.toFixed(2);
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
    --bg: #0b0f19;
    --bg-card: rgba(17, 24, 39, 0.55);
    --bg-card-solid: #111827;
    --bg-card-hover: rgba(17, 24, 39, 0.75);
    --border: rgba(255, 255, 255, 0.05);
    --border-strong: rgba(255, 255, 255, 0.08);
    --text: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-muted: #94a3b8;
    --text-dim: #64748b;
    --accent: #818cf8;
    --accent-soft: rgba(129, 140, 248, 0.1);
    --accent-glow: rgba(129, 140, 248, 0.25);
    --green: #34d399;
    --yellow: #fbbf24;
    --red: #f87171;
    --cyan: #67e8f9;
    --orange: #fb923c;
    --radius: 16px;
    --radius-sm: 10px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.55;
    min-height: 100vh;
    position: relative;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  /* Subtle gradient background — understated, not flashy */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 50% at 20% 0%, rgba(129, 140, 248, 0.06) 0%, transparent 60%),
      radial-gradient(ellipse 60% 40% at 80% 100%, rgba(99, 102, 241, 0.04) 0%, transparent 50%);
    pointer-events: none;
    z-index: 0;
  }

  .container {
    max-width: 1140px;
    margin: 0 auto;
    padding: 48px 28px 96px;
    position: relative;
    z-index: 1;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 56px;
  }

  .header h1 {
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.8px;
    margin-bottom: 6px;
    background: linear-gradient(135deg, #e2e8f0, #94a3b8);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .header .tagline {
    color: var(--text-muted);
    font-size: 15px;
    font-weight: 300;
  }

  .header .generated {
    color: var(--text-dim);
    font-size: 12px;
    margin-top: 10px;
    font-weight: 300;
  }

  /* Sections */
  .section {
    margin-bottom: 40px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 18px;
  }

  /* Glassmorphism card base */
  .glass {
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }

  /* Cards Grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }

  .card {
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px 22px;
    transition: border-color 0.25s, transform 0.25s, box-shadow 0.25s;
    position: relative;
    overflow: hidden;
  }

  .card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent);
  }

  .card:hover {
    border-color: rgba(99, 102, 241, 0.3);
    transform: translateY(-2px);
    box-shadow: 0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(99,102,241,0.1);
  }

  .card .label {
    font-size: 11px;
    font-weight: 300;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 6px;
  }

  .card .value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .card .sub {
    font-size: 13px;
    font-weight: 300;
    color: var(--text-dim);
    margin-top: 5px;
  }

  /* ─── Share Card (Hero) ─── */
  @keyframes gradientBorder {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  @keyframes gradeGlow {
    0%, 100% { box-shadow: 0 0 20px ${grade.color}40, 0 0 60px ${grade.color}15; }
    50%       { box-shadow: 0 0 32px ${grade.color}60, 0 0 80px ${grade.color}25; }
  }

  .share-card-wrapper {
    padding: 2px;
    border-radius: 22px;
    background: linear-gradient(135deg, ${grade.color}60, rgba(99,102,241,0.4), rgba(34,211,238,0.3), ${grade.color}60);
    background-size: 300% 300%;
    animation: gradientBorder 6s ease infinite;
    margin-bottom: 52px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  }

  .share-card {
    width: 100%;
    background: linear-gradient(145deg, #080f1e 0%, #0c1525 35%, #0e1a2d 65%, #091020 100%);
    border-radius: 20px;
    padding: 52px 56px;
    position: relative;
    overflow: hidden;
  }

  .share-card::before {
    content: '';
    position: absolute;
    top: -40%;
    right: -15%;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, ${grade.color}14 0%, ${grade.color}06 35%, transparent 65%);
    pointer-events: none;
  }

  .share-card::after {
    content: '';
    position: absolute;
    bottom: -30%;
    left: -10%;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 60%);
    pointer-events: none;
  }

  .share-card-inner {
    position: relative;
    z-index: 1;
  }

  .share-card .grade-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 96px;
    height: 96px;
    border-radius: 26px;
    background: ${grade.color}18;
    border: 2px solid ${grade.color}50;
    font-size: 52px;
    font-weight: 800;
    color: ${grade.color};
    margin-bottom: 22px;
    animation: gradeGlow 3s ease-in-out infinite;
    letter-spacing: -2px;
  }

  .share-card .grade-label {
    color: ${grade.color};
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    margin-bottom: 32px;
    display: block;
  }

  .share-card .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    margin-bottom: 36px;
  }

  .share-card .stat {
    text-align: center;
    padding: 0 24px;
    border-right: 1px solid var(--border);
  }

  .share-card .stat:first-child { padding-left: 0; }
  .share-card .stat:last-child  { border-right: none; }

  .share-card .stat-value {
    font-size: 46px;
    font-weight: 800;
    letter-spacing: -2px;
    line-height: 1;
    margin-bottom: 6px;
  }

  .share-card .stat-label {
    font-size: 11px;
    font-weight: 300;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .share-card .branding {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 24px;
    border-top: 1px solid var(--border);
  }

  .share-card .brand-name {
    font-weight: 700;
    font-size: 15px;
    color: var(--text);
  }

  .share-card .brand-sub {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 300;
  }

  /* ─── Chart ─── */
  .chart-container {
    background: var(--bg-card);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px;
  }

  .chart-controls {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .chart-btn {
    padding: 5px 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .chart-btn:hover {
    border-color: rgba(99,102,241,0.4);
    color: var(--text);
    background: rgba(99,102,241,0.1);
  }

  .chart-btn.active {
    background: rgba(99,102,241,0.2);
    border-color: rgba(99,102,241,0.5);
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
    backdrop-filter: blur(12px);
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
    margin-bottom: 4px;
  }

  .chart-tooltip .tt-cost {
    font-weight: 700;
    font-size: 18px;
    letter-spacing: -0.5px;
  }

  .chart-tooltip .tt-anomaly {
    font-size: 11px;
    color: var(--red);
    margin-top: 3px;
  }

  /* ─── Model Split ─── */
  .model-bar {
    display: flex;
    height: 44px;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 20px;
    gap: 2px;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.3), 0 0 0 1px var(--border);
  }

  .model-bar-segment {
    height: 100%;
    transition: opacity 0.2s, transform 0.2s;
    cursor: default;
    position: relative;
  }

  .model-bar-segment:first-child { border-radius: 12px 0 0 12px; }
  .model-bar-segment:last-child  { border-radius: 0 12px 12px 0; }
  .model-bar-segment:only-child  { border-radius: 12px; }

  .model-bar-segment:hover { opacity: 0.85; }

  .model-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 24px;
  }

  .model-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 400;
  }

  .model-legend-item .model-name {
    color: var(--text-muted);
    font-weight: 300;
  }

  .model-legend-item .model-cost {
    font-weight: 700;
  }

  .model-legend-item .model-pct {
    color: var(--text-dim);
    font-weight: 300;
    font-size: 12px;
  }

  .model-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  /* ─── Recommendations ─── */
  .rec-card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
    margin-bottom: 12px;
    border-left: 3px solid;
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .rec-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, var(--rec-color-soft) 0%, transparent 60%);
    pointer-events: none;
  }

  .rec-card.critical {
    --rec-color-soft: rgba(239, 68, 68, 0.06);
    border-left-color: var(--red);
    background: rgba(239, 68, 68, 0.04);
  }

  .rec-card.warning {
    --rec-color-soft: rgba(245, 158, 11, 0.06);
    border-left-color: var(--yellow);
    background: rgba(245, 158, 11, 0.04);
  }

  .rec-card.info {
    --rec-color-soft: rgba(34, 211, 238, 0.05);
    border-left-color: var(--cyan);
    background: rgba(34, 211, 238, 0.03);
  }

  .rec-card.positive {
    --rec-color-soft: rgba(16, 185, 129, 0.06);
    border-left-color: var(--green);
    background: rgba(16, 185, 129, 0.04);
  }

  .rec-card-inner {
    position: relative;
    z-index: 1;
  }

  .rec-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 5px;
  }

  .rec-detail {
    font-size: 13px;
    font-weight: 300;
    color: var(--text-muted);
    margin-bottom: 8px;
  }

  .rec-action {
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }

  /* ─── Rate Limits ─── */
  .rate-bar-bg {
    height: 6px;
    background: rgba(255,255,255,0.05);
    border-radius: 3px;
    overflow: hidden;
    margin: 10px 0 6px;
  }

  .rate-bar-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.4s ease;
  }

  /* ─── Cache Break Reasons ─── */
  .reason-row {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 10px;
    font-size: 13px;
  }

  .reason-row .reason-name {
    width: 220px;
    flex-shrink: 0;
    font-weight: 300;
    color: var(--text-muted);
  }

  .reason-row .reason-fill-bg {
    flex: 1;
    height: 5px;
    background: rgba(255,255,255,0.05);
    border-radius: 3px;
    overflow: hidden;
  }

  .reason-row .reason-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--orange), #fbbf24);
    border-radius: 3px;
  }

  .reason-row .reason-count {
    width: 36px;
    text-align: right;
    font-weight: 300;
    color: var(--text-dim);
    font-size: 12px;
  }

  /* ─── Anomaly Table ─── */
  .anomaly-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .anomaly-table th {
    text-align: left;
    padding: 10px 14px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
  }

  .anomaly-table td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    font-weight: 400;
  }

  .anomaly-table tr:last-child td { border-bottom: none; }

  .anomaly-table tbody tr {
    transition: background 0.15s;
  }

  .anomaly-table tbody tr:hover td {
    background: rgba(255,255,255,0.02);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }

  .badge.critical {
    background: rgba(239, 68, 68, 0.15);
    color: #f87171;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
  }

  .badge.warning {
    background: rgba(245, 158, 11, 0.15);
    color: #fbbf24;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.12);
  }

  .badge.spike {
    background: rgba(249, 115, 22, 0.15);
    color: #fb923c;
    box-shadow: 0 0 12px rgba(249, 115, 22, 0.12);
  }

  /* ─── CLAUDE.md Stack ─── */
  .claudemd-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }

  .claudemd-row:last-of-type { border-bottom: none; }

  .claudemd-row .row-label {
    font-weight: 300;
    color: var(--text-muted);
    font-size: 13px;
  }

  .claudemd-row .row-value {
    font-weight: 500;
    color: var(--text);
    font-size: 13px;
  }

  /* ─── Footer ─── */
  .footer {
    text-align: center;
    padding-top: 56px;
    color: var(--text-dim);
    font-size: 12px;
    font-weight: 300;
  }

  .footer a {
    color: var(--text-dim);
    text-decoration: none;
    transition: color 0.2s;
  }

  .footer a:hover { color: var(--text-muted); }

  .footer .accent-link {
    color: var(--accent);
    font-weight: 600;
    text-decoration: none;
  }

  .footer .accent-link:hover { color: #a5b4fc; }

  .footer-tagline {
    margin-top: 10px;
    font-size: 12px;
    color: var(--text-dim);
  }

  /* ─── Divider ─── */
  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border), transparent);
    margin: 0 0 40px;
  }

  /* ─── Summary filter line ─── */
  #filter-summary {
    font-size: 12px;
    color: var(--text-dim);
    font-weight: 300;
    margin-left: auto;
  }
</style>
</head>
<body>

<div class="chart-tooltip" id="chart-tooltip">
  <div class="tt-date" id="tt-date"></div>
  <div class="tt-cost" id="tt-cost"></div>
  <div class="tt-anomaly" id="tt-anomaly"></div>
</div>

<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>CC Hubber</h1>
    <div class="tagline">What you spent. Why you spent it. Is that normal.</div>
    <div class="generated">Generated ${new Date(generatedAt).toLocaleString()} &mdash; Last ${report.periodDays} days</div>
  </div>

  <!-- Hero / Shareable Card -->
  <div class="share-card-wrapper">
    <div class="share-card">
      <div class="share-card-inner">
        <div class="grade-badge">${grade.letter}</div>
        <span class="grade-label">Cache Health: ${grade.label}</span>
        <div class="stats-row">
          <div class="stat">
            <div class="stat-value" id="hero-cost">${fmtCost(totalCost)}</div>
            <div class="stat-label">Total Spend</div>
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
          <div class="brand-sub">Shipped with <a href="https://moveros.dev" target="_blank" style="color:var(--accent);font-weight:600;text-decoration:none;">Mover OS</a> at speed</div>
        </div>
      </div>
    </div>
  </div>

  ${oauthUsage ? renderRateLimits(oauthUsage) : ''}

  <!-- Overview Cards -->
  <div class="section">
    <div class="section-title">Overview</div>
    <div class="grid">
      <div class="card">
        <div class="label">Total Cost</div>
        <div class="value" id="ov-total">${fmtCost(totalCost)}</div>
        <div class="sub" id="ov-avg">$${(costAnalysis.avgDailyCost || 0).toFixed(2)} avg / day</div>
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
        <div class="label">CLAUDE.md Load</div>
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

  <!-- Daily Cost Trend (area chart with interactive filter) -->
  <div class="section">
    <div class="section-title">Daily Cost Trend</div>
    <div class="chart-container">
      <div style="display:flex;align-items:center;gap:0;margin-bottom:20px;">
        <div class="chart-controls" id="range-controls">
          <button class="chart-btn" data-range="7">7d</button>
          <button class="chart-btn" data-range="30">30d</button>
          <button class="chart-btn" data-range="90">90d</button>
          <button class="chart-btn active" data-range="all">All</button>
        </div>
        <span id="filter-summary"></span>
      </div>
      <div id="chart-area" style="position:relative;">
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
    <div class="glass" style="overflow:hidden;">
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
              <td style="font-weight:700;">$${a.cost.toFixed(2)}</td>
              <td style="color:${a.deviation > 0 ? 'var(--red)' : 'var(--green)'};font-weight:500;">${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)}</td>
              <td style="font-weight:300;color:var(--text-muted);">${a.cacheOutputRatio ? a.cacheOutputRatio.toLocaleString() + ':1' : 'N/A'}</td>
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
        <div class="rec-card-inner">
          <div class="rec-title">${r.title}</div>
          <div class="rec-detail">${r.detail}</div>
          <div class="rec-action">&rarr; ${r.action}</div>
        </div>
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
          <span class="row-value">${(f.bytes / 1024).toFixed(1)} KB &nbsp;&mdash;&nbsp; ~${f.tokensEstimate.toLocaleString()} tokens</span>
        </div>
      `).join('')}
      <div class="claudemd-row" style="margin-top:8px;">
        <span class="row-label" style="color:var(--text);font-weight:500;">Per-message cost impact</span>
        <span class="row-value">$${claudeMdStack.costPerMessage.cached.toFixed(4)} cached &nbsp;/&nbsp; $${claudeMdStack.costPerMessage.uncached.toFixed(4)} uncached</span>
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
    <div class="footer-tagline">Shipped with <a href="https://moveros.dev" target="_blank" class="accent-link">Mover OS</a> at speed</div>
  </div>

</div>

<!-- Embedded data + interactive chart logic -->
<script>
(function() {
  'use strict';

  var ALL_DATA = ${dailyCostsJSON};

  // ─── Chart renderer ───────────────────────────────────────────
  var W = 1000, H = 220;
  var PAD = { top: 24, right: 24, bottom: 44, left: 64 };
  var chartW = W - PAD.left - PAD.right;
  var chartH = H - PAD.top - PAD.bottom;

  var svg = document.getElementById('cost-chart-svg');
  var tooltip = document.getElementById('chart-tooltip');
  var ttDate = document.getElementById('tt-date');
  var ttCost = document.getElementById('tt-cost');
  var ttAnomaly = document.getElementById('tt-anomaly');

  function fmtCostJS(n) {
    if (n >= 100) return '$' + Math.round(n).toLocaleString();
    return '$' + n.toFixed(2);
  }

  function getFilteredData(range) {
    if (range === 'all' || !range) return ALL_DATA;
    var days = parseInt(range, 10);
    if (!days || isNaN(days)) return ALL_DATA;
    return ALL_DATA.slice(-days);
  }

  function buildAreaPath(data, maxCost, smooth) {
    if (data.length === 0) return '';
    var step = chartW / Math.max(data.length - 1, 1);
    var points = data.map(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var y = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      return { x: x, y: y };
    });

    // Smooth cubic bezier path
    var linePath = '';
    var areaPath = '';
    var startX = points[0].x;
    var endX = points[points.length - 1].x;
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

      areaPath = 'M ' + startX + ' ' + baseY;
      areaPath += ' L ' + points[0].x + ' ' + points[0].y;
      for (var j = 1; j < points.length; j++) {
        var pp = points[j - 1];
        var cp = points[j];
        var cpxj = (pp.x + cp.x) / 2;
        areaPath += ' C ' + cpxj + ' ' + pp.y + ' ' + cpxj + ' ' + cp.y + ' ' + cp.x + ' ' + cp.y;
      }
      areaPath += ' L ' + endX + ' ' + baseY + ' Z';
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
    maxCost = maxCost * 1.12; // headroom
    if (maxCost < 0.01) maxCost = 1;

    var paths = buildAreaPath(data, maxCost);
    var gradId = 'areaGrad_' + Date.now();

    var html = '';

    // Defs: gradient + clip
    html += '<defs>';
    html += '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">';
    html += '<stop offset="0%" stop-color="#6366f1" stop-opacity="0.35"/>';
    html += '<stop offset="60%" stop-color="#6366f1" stop-opacity="0.08"/>';
    html += '<stop offset="100%" stop-color="#6366f1" stop-opacity="0"/>';
    html += '</linearGradient>';
    html += '</defs>';

    // Grid lines + Y labels
    var yTicks = 4;
    for (var i = 0; i <= yTicks; i++) {
      var y = PAD.top + (chartH / yTicks) * i;
      var val = maxCost - (maxCost / yTicks) * i;
      html += '<line x1="' + PAD.left + '" y1="' + y + '" x2="' + (W - PAD.right) + '" y2="' + y + '" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>';
      html += '<text x="' + (PAD.left - 10) + '" y="' + (y + 4) + '" text-anchor="end" fill="#475569" font-size="10" font-family="system-ui,sans-serif">$' + (val < 1 ? val.toFixed(2) : val.toFixed(0)) + '</text>';
    }

    // X-axis baseline
    html += '<line x1="' + PAD.left + '" y1="' + (PAD.top + chartH) + '" x2="' + (W - PAD.right) + '" y2="' + (PAD.top + chartH) + '" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';

    // Area fill
    html += '<path d="' + paths.areaPath + '" fill="url(#' + gradId + ')"/>';

    // Line
    html += '<path d="' + paths.linePath + '" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

    // X-axis labels
    var step = data.length > 1 ? chartW / (data.length - 1) : 0;
    var showEvery = Math.max(1, Math.floor(data.length / 10));
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      if (i % showEvery === 0 || i === data.length - 1) {
        var label = d.date.slice(5); // MM-DD
        html += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="#475569" font-size="9" font-family="system-ui,sans-serif">' + label + '</text>';
      }
    });

    // Anomaly dots (red, larger)
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var y = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      if (d.isAnomaly) {
        html += '<circle cx="' + x + '" cy="' + y + '" r="5" fill="#ef4444" stroke="#0a0e17" stroke-width="2" class="anomaly-dot"/>';
        html += '<circle cx="' + x + '" cy="' + y + '" r="9" fill="rgba(239,68,68,0.15)"/>';
      }
    });

    // Invisible hover targets
    data.forEach(function(d, i) {
      var x = PAD.left + (data.length === 1 ? chartW / 2 : i * step);
      var y = maxCost > 0 ? PAD.top + chartH - (d.cost / maxCost) * chartH : PAD.top + chartH;
      html += '<circle cx="' + x + '" cy="' + y + '" r="16" fill="transparent"';
      html += ' data-date="' + d.date + '" data-cost="' + d.cost + '" data-anomaly="' + (d.isAnomaly ? '1' : '0') + '"';
      html += ' class="chart-hover-target" style="cursor:pointer;"/>';
    });

    svg.innerHTML = html;

    // Attach hover events
    svg.querySelectorAll('.chart-hover-target').forEach(function(el) {
      el.addEventListener('mouseenter', function(e) {
        ttDate.textContent = e.target.dataset.date;
        ttCost.textContent = fmtCostJS(parseFloat(e.target.dataset.cost));
        ttAnomaly.textContent = e.target.dataset.anomaly === '1' ? '⚠ Anomaly' : '';
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

  // ─── Range filter ──────────────────────────────────────────────
  var currentRange = 'all';

  function updateFilterSummary(data) {
    var el = document.getElementById('filter-summary');
    if (!el) return;
    if (!data || data.length === 0) { el.textContent = ''; return; }
    var total = data.reduce(function(s, d) { return s + d.cost; }, 0);
    var activeDays = data.filter(function(d) { return d.cost > 0; }).length;
    el.textContent = activeDays + ' active days \u00B7 ' + fmtCostJS(total) + ' in range';
  }

  function setRange(range) {
    currentRange = range;
    var filtered = getFilteredData(range);
    renderChart(filtered);
    updateFilterSummary(filtered);

    // Update hero stats for filtered range
    if (filtered.length > 0) {
      var totalFiltered = filtered.reduce(function(s, d) { return s + d.cost; }, 0);
      var activeDaysFiltered = filtered.filter(function(d) { return d.cost > 0; }).length;
      var heroCost = document.getElementById('hero-cost');
      var heroDays = document.getElementById('hero-days');
      var ovTotal = document.getElementById('ov-total');
      var ovAvg = document.getElementById('ov-avg');
      if (heroCost) heroCost.textContent = fmtCostJS(totalFiltered);
      if (heroDays) heroDays.textContent = activeDaysFiltered;
      if (ovTotal) ovTotal.textContent = fmtCostJS(totalFiltered);
      if (ovAvg && activeDaysFiltered > 0) ovAvg.textContent = fmtCostJS(totalFiltered / activeDaysFiltered) + ' avg / day';
    }

    // Update buttons
    document.querySelectorAll('.chart-btn[data-range]').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.range === range);
    });
  }

  document.querySelectorAll('.chart-btn[data-range]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      setRange(btn.dataset.range);
    });
  });

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
  <div class="section" style="margin-bottom:40px;">
    <div class="section-title">Live Rate Limits</div>
    <div class="grid">
      <div class="card">
        <div class="label">5-Hour Session</div>
        <div class="value" style="color:${fiveColor};font-size:32px;font-weight:800;">${fivePct}%</div>
        <div class="rate-bar-bg">
          <div class="rate-bar-fill" style="width:${fivePct}%;background:${fiveColor};"></div>
        </div>
        <div class="sub">${fiveHour?.resets_at ? 'Resets ' + new Date(fiveHour.resets_at).toLocaleTimeString() : 'No reset data'}</div>
      </div>
      <div class="card">
        <div class="label">7-Day Rolling</div>
        <div class="value" style="color:${sevenColor};font-size:32px;font-weight:800;">${sevenPct}%</div>
        <div class="rate-bar-bg">
          <div class="rate-bar-fill" style="width:${sevenPct}%;background:${sevenColor};"></div>
        </div>
        <div class="sub">${sevenDay?.resets_at ? 'Resets ' + new Date(sevenDay.resets_at).toLocaleDateString() : 'No reset data'}</div>
      </div>
    </div>
    <div style="height:40px;"></div>
    <div class="divider" style="margin-bottom:0;"></div>
  </div>`;
}
