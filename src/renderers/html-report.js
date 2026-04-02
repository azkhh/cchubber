export function renderHTML(report) {
  const { costAnalysis, cacheHealth, anomalies, claudeMdStack, oauthUsage, recommendations, generatedAt } = report;

  const dailyCosts = costAnalysis.dailyCosts || [];
  const grade = cacheHealth.grade || { letter: '?', color: '#666', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;
  const activeDays = costAnalysis.activeDays || 0;
  const peakDay = costAnalysis.peakDay;

  // Chart data
  const chartDates = dailyCosts.map(d => d.date.slice(5)); // MM-DD
  const chartCosts = dailyCosts.map(d => d.cost);
  const chartRatios = dailyCosts.map(d => d.cacheOutputRatio);
  const maxCost = Math.max(...chartCosts, 1);
  const maxRatio = Math.max(...chartRatios, 1);

  // Model split data
  const modelCosts = costAnalysis.modelCosts || {};
  const modelEntries = Object.entries(modelCosts).sort((a, b) => b[1] - a[1]);
  const modelColors = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

  // Anomaly dates for highlighting
  const anomalyDates = new Set((anomalies.anomalies || []).map(a => a.date.slice(5)));

  // Rate limit bars
  const fiveHour = oauthUsage?.five_hour;
  const sevenDay = oauthUsage?.seven_day;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CC Hubber — Usage Report</title>
<style>
  :root {
    --bg: #0a0e17;
    --bg-card: #111827;
    --bg-card-hover: #1a2332;
    --border: #1e293b;
    --text: #e2e8f0;
    --text-muted: #64748b;
    --text-dim: #475569;
    --accent: #6366f1;
    --accent-glow: rgba(99, 102, 241, 0.15);
    --green: #10b981;
    --yellow: #f59e0b;
    --red: #ef4444;
    --cyan: #22d3ee;
    --orange: #f97316;
    --radius: 12px;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  .container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 24px 80px;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: 48px;
  }

  .header h1 {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }

  .header .tagline {
    color: var(--text-muted);
    font-size: 15px;
  }

  .header .generated {
    color: var(--text-dim);
    font-size: 12px;
    margin-top: 8px;
  }

  /* Shareable Card */
  .share-card {
    width: 100%;
    max-width: 680px;
    margin: 0 auto 48px;
    background: linear-gradient(135deg, #111827 0%, #1a1a2e 50%, #16213e 100%);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px;
    position: relative;
    overflow: hidden;
  }

  .share-card::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -30%;
    width: 300px;
    height: 300px;
    background: radial-gradient(circle, ${grade.color}15 0%, transparent 70%);
    pointer-events: none;
  }

  .share-card .grade-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 20px;
    background: ${grade.color}20;
    border: 2px solid ${grade.color}60;
    font-size: 36px;
    font-weight: 800;
    color: ${grade.color};
    margin-bottom: 20px;
  }

  .share-card .grade-label {
    color: ${grade.color};
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 24px;
    display: block;
  }

  .share-card .stats-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }

  .share-card .stat {
    text-align: center;
  }

  .share-card .stat-value {
    font-size: 28px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }

  .share-card .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-top: 2px;
  }

  .share-card .branding {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }

  .share-card .brand-name {
    font-weight: 700;
    font-size: 14px;
    color: var(--text-muted);
  }

  .share-card .brand-sub {
    font-size: 11px;
    color: var(--text-dim);
  }

  /* Sections */
  .section {
    margin-bottom: 36px;
  }

  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  /* Cards Grid */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }

  .card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    transition: border-color 0.2s;
  }

  .card:hover { border-color: var(--accent); }

  .card .label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .card .value {
    font-size: 24px;
    font-weight: 700;
  }

  .card .sub {
    font-size: 13px;
    color: var(--text-dim);
    margin-top: 4px;
  }

  /* Chart */
  .chart-container {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px;
    overflow-x: auto;
  }

  .chart-svg {
    width: 100%;
    min-width: 600px;
    height: 220px;
  }

  /* Model Split */
  .model-bar {
    display: flex;
    height: 32px;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .model-bar-segment {
    height: 100%;
    transition: opacity 0.2s;
    cursor: default;
  }

  .model-bar-segment:hover { opacity: 0.8; }

  .model-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
  }

  .model-legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }

  .model-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
  }

  /* Recommendations */
  .rec-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 20px;
    margin-bottom: 12px;
    border-left: 3px solid;
  }

  .rec-card.critical { border-left-color: var(--red); }
  .rec-card.warning { border-left-color: var(--yellow); }
  .rec-card.info { border-left-color: var(--cyan); }
  .rec-card.positive { border-left-color: var(--green); }

  .rec-title {
    font-weight: 600;
    font-size: 14px;
    margin-bottom: 4px;
  }

  .rec-detail {
    font-size: 13px;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  .rec-action {
    font-size: 13px;
    color: var(--accent);
  }

  /* Rate Limits */
  .rate-bar-bg {
    height: 8px;
    background: var(--border);
    border-radius: 4px;
    overflow: hidden;
    margin: 8px 0;
  }

  .rate-bar-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s;
  }

  /* Cache Break Reasons */
  .reason-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  .reason-bar .reason-name {
    width: 200px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  .reason-bar .reason-fill-bg {
    flex: 1;
    height: 6px;
    background: var(--border);
    border-radius: 3px;
    overflow: hidden;
  }

  .reason-bar .reason-fill {
    height: 100%;
    background: var(--orange);
    border-radius: 3px;
  }

  .reason-bar .reason-count {
    width: 40px;
    text-align: right;
    color: var(--text-dim);
  }

  /* Anomaly table */
  .anomaly-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .anomaly-table th {
    text-align: left;
    padding: 8px 12px;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border);
    font-weight: 500;
  }

  .anomaly-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }

  .anomaly-table tr:hover td { background: var(--bg-card-hover); }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge.critical { background: #ef444420; color: var(--red); }
  .badge.warning { background: #f59e0b20; color: var(--yellow); }
  .badge.spike { background: #f9731620; color: var(--orange); }

  /* Footer */
  .footer {
    text-align: center;
    padding-top: 48px;
    color: var(--text-dim);
    font-size: 12px;
  }

  .footer a {
    color: var(--accent);
    text-decoration: none;
  }

  .footer a:hover { text-decoration: underline; }

  .mover-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 12px;
    text-decoration: none;
  }

  .mover-badge:hover { border-color: var(--accent); color: var(--text); }
</style>
</head>
<body>
<div class="container">

  <!-- Header -->
  <div class="header">
    <h1>CC Hubber</h1>
    <div class="tagline">What you spent. Why you spent it. Is that normal.</div>
    <div class="generated">Generated ${new Date(generatedAt).toLocaleString()} — Last ${report.periodDays} days</div>
  </div>

  <!-- Shareable Card -->
  <div class="share-card">
    <div class="grade-badge">${grade.letter}</div>
    <span class="grade-label">Cache Health: ${grade.label}</span>
    <div class="stats-row">
      <div class="stat">
        <div class="stat-value">$${totalCost.toFixed(0)}</div>
        <div class="stat-label">Total Spend</div>
      </div>
      <div class="stat">
        <div class="stat-value">${activeDays}</div>
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
        <div class="brand-sub">github.com/asmirkn/cchubber</div>
      </div>
      <div class="brand-sub">Shipped with Mover OS at speed — moveros.dev</div>
    </div>
  </div>

  ${oauthUsage ? renderRateLimits(oauthUsage) : ''}

  <!-- Overview Cards -->
  <div class="section">
    <div class="section-title">Overview</div>
    <div class="grid">
      <div class="card">
        <div class="label">Total Cost</div>
        <div class="value">$${totalCost.toFixed(2)}</div>
        <div class="sub">$${(costAnalysis.avgDailyCost || 0).toFixed(2)} avg/day</div>
      </div>
      <div class="card">
        <div class="label">Peak Day</div>
        <div class="value">$${peakDay ? peakDay.cost.toFixed(2) : '0'}</div>
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
        <div class="sub">tokens (${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB)</div>
      </div>
      <div class="card">
        <div class="label">Sessions</div>
        <div class="value">${costAnalysis.sessions?.total || 0}</div>
        <div class="sub">${costAnalysis.sessions?.avgDurationMinutes ? Math.round(costAnalysis.sessions.avgDurationMinutes) + ' min avg' : ''}</div>
      </div>
    </div>
  </div>

  <!-- Cost Trend Chart -->
  <div class="section">
    <div class="section-title">Daily Cost Trend</div>
    <div class="chart-container">
      ${renderCostChart(dailyCosts, maxCost, anomalyDates)}
    </div>
  </div>

  <!-- Model Split -->
  <div class="section">
    <div class="section-title">Model Cost Split</div>
    <div class="chart-container">
      <div class="model-bar">
        ${modelEntries.map(([name, cost], i) => {
          const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0;
          return `<div class="model-bar-segment" style="width:${pct}%;background:${modelColors[i % modelColors.length]}" title="${name}: $${cost.toFixed(2)} (${pct.toFixed(1)}%)"></div>`;
        }).join('')}
      </div>
      <div class="model-legend">
        ${modelEntries.map(([name, cost], i) => {
          const pct = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : '0';
          return `<div class="model-legend-item"><div class="model-legend-dot" style="background:${modelColors[i % modelColors.length]}"></div>${name} — $${cost.toFixed(2)} (${pct}%)</div>`;
        }).join('')}
      </div>
    </div>
  </div>

  <!-- Cache Break Reasons -->
  ${cacheHealth.totalCacheBreaks > 0 ? `
  <div class="section">
    <div class="section-title">Cache Break Reasons</div>
    <div class="chart-container">
      ${(cacheHealth.reasonsRanked || []).map(r => `
        <div class="reason-bar">
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

  <!-- Anomalies -->
  ${anomalies.hasAnomalies ? `
  <div class="section">
    <div class="section-title">Anomalies Detected</div>
    <div class="chart-container">
      <table class="anomaly-table">
        <thead>
          <tr><th>Date</th><th>Cost</th><th>Deviation</th><th>Cache Ratio</th><th>Severity</th></tr>
        </thead>
        <tbody>
          ${anomalies.anomalies.map(a => `
            <tr>
              <td>${a.date}</td>
              <td>$${a.cost.toFixed(2)}</td>
              <td>${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)}</td>
              <td>${a.cacheOutputRatio ? a.cacheOutputRatio.toLocaleString() + ':1' : 'N/A'}</td>
              <td><span class="badge ${a.severity}">${a.severity}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
  ` : ''}

  <!-- Recommendations -->
  ${recommendations.length > 0 ? `
  <div class="section">
    <div class="section-title">Recommendations</div>
    ${recommendations.map(r => `
      <div class="rec-card ${r.severity}">
        <div class="rec-title">${r.title}</div>
        <div class="rec-detail">${r.detail}</div>
        <div class="rec-action">${r.action}</div>
      </div>
    `).join('')}
  </div>
  ` : ''}

  <!-- CLAUDE.md Stack -->
  <div class="section">
    <div class="section-title">CLAUDE.md Analysis</div>
    <div class="chart-container">
      ${claudeMdStack.files.map(f => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span style="color:var(--text-muted)">${f.level}</span>
          <span>${(f.bytes / 1024).toFixed(1)} KB (~${f.tokensEstimate.toLocaleString()} tokens)</span>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;padding:12px 0;font-weight:600;">
        <span>Per-message cost impact</span>
        <span>$${claudeMdStack.costPerMessage.cached.toFixed(4)} cached / $${claudeMdStack.costPerMessage.uncached.toFixed(4)} uncached</span>
      </div>
    </div>
  </div>

  ${cacheHealth.savings?.fromCaching ? `
  <div class="section">
    <div class="section-title">Savings from Caching</div>
    <div class="grid">
      <div class="card">
        <div class="label">Saved by Cache</div>
        <div class="value" style="color:var(--green)">~$${cacheHealth.savings.fromCaching.toLocaleString()}</div>
        <div class="sub">vs standard input pricing</div>
      </div>
      <div class="card">
        <div class="label">Wasted on Breaks</div>
        <div class="value" style="color:var(--orange)">~$${cacheHealth.savings.wastedFromBreaks.toLocaleString()}</div>
        <div class="sub">from cache invalidation</div>
      </div>
    </div>
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <div>CC Hubber v0.1.0 — <a href="https://github.com/asmirkn/cchubber" target="_blank">github.com/asmirkn/cchubber</a></div>
    <a href="https://moveros.dev" target="_blank" class="mover-badge">
      <span>Shipped with Mover OS at speed</span>
    </a>
  </div>

</div>
</body>
</html>`;
}

function renderCostChart(dailyCosts, maxCost, anomalyDates) {
  if (dailyCosts.length === 0) return '<div style="color:var(--text-dim);text-align:center;padding:40px;">No daily data available</div>';

  const width = 1000;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const barWidth = Math.max(2, Math.min(20, (chartW / dailyCosts.length) - 2));
  const gap = (chartW - barWidth * dailyCosts.length) / (dailyCosts.length + 1);

  // Y-axis labels
  const yTicks = 5;
  const yStep = maxCost / yTicks;

  let svg = `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">`;

  // Grid lines
  for (let i = 0; i <= yTicks; i++) {
    const y = padding.top + (chartH / yTicks) * i;
    const val = maxCost - (yStep * i);
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
    svg += `<text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="10">$${val.toFixed(0)}</text>`;
  }

  // Bars
  dailyCosts.forEach((d, i) => {
    const x = padding.left + gap + i * (barWidth + gap);
    const barH = maxCost > 0 ? (d.cost / maxCost) * chartH : 0;
    const y = padding.top + chartH - barH;
    const isAnomaly = anomalyDates.has(d.date.slice(5));

    svg += `<rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="2" fill="${isAnomaly ? '#ef4444' : '#6366f1'}" opacity="${isAnomaly ? '1' : '0.7'}">`;
    svg += `<title>${d.date}: $${d.cost.toFixed(2)}${isAnomaly ? ' (ANOMALY)' : ''}</title>`;
    svg += `</rect>`;

    // X-axis labels (show every Nth)
    const showEvery = Math.max(1, Math.floor(dailyCosts.length / 12));
    if (i % showEvery === 0) {
      svg += `<text x="${x + barWidth / 2}" y="${height - 8}" text-anchor="middle" fill="#64748b" font-size="9" transform="rotate(-45, ${x + barWidth / 2}, ${height - 12})">${d.date.slice(5)}</text>`;
    }
  });

  svg += '</svg>';
  return svg;
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
  <div class="section">
    <div class="section-title">Live Rate Limits</div>
    <div class="grid">
      <div class="card">
        <div class="label">5-Hour Session</div>
        <div class="value" style="color:${fiveColor}">${fivePct}%</div>
        <div class="rate-bar-bg"><div class="rate-bar-fill" style="width:${fivePct}%;background:${fiveColor}"></div></div>
        <div class="sub">${fiveHour?.resets_at ? 'Resets ' + new Date(fiveHour.resets_at).toLocaleTimeString() : ''}</div>
      </div>
      <div class="card">
        <div class="label">7-Day Rolling</div>
        <div class="value" style="color:${sevenColor}">${sevenPct}%</div>
        <div class="rate-bar-bg"><div class="rate-bar-fill" style="width:${sevenPct}%;background:${sevenColor}"></div></div>
        <div class="sub">${sevenDay?.resets_at ? 'Resets ' + new Date(sevenDay.resets_at).toLocaleDateString() : ''}</div>
      </div>
    </div>
  </div>`;
}
