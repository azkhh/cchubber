// ANSI color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

export function renderTerminal(report) {
  const { costAnalysis, cacheHealth, anomalies, claudeMdStack, recommendations, inflection, modelRouting, sessionIntel } = report;

  const grade = cacheHealth.grade || { letter: '?', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;
  const gradeColor = grade.letter === 'A' ? c.green : grade.letter === 'B' ? c.cyan : grade.letter === 'C' ? c.yellow : c.red;

  // Grade box
  console.log('');
  console.log(`  ${c.gray}┌─────────────────────────────────────────────────┐${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${gradeColor}${c.bold}Grade: ${grade.letter}${c.reset} ${c.dim}(${grade.label})${c.reset}${' '.repeat(38 - grade.label.length)}${c.gray}│${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.white}${c.bold}$${totalCost.toFixed(0)}${c.reset} ${c.dim}over ${costAnalysis.activeDays} active days${c.reset}${' '.repeat(Math.max(0, 29 - totalCost.toFixed(0).length - String(costAnalysis.activeDays).length))}${c.gray}│${c.reset}`);
  console.log(`  ${c.gray}│${c.reset}  ${c.dim}$${(costAnalysis.avgDailyCost || 0).toFixed(2)}/day avg${c.reset}  ${c.dim}│${c.reset}  ${c.dim}cache ${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}${c.reset}${' '.repeat(Math.max(0, 16 - String(cacheHealth.efficiencyRatio || 0).length))}${c.gray}│${c.reset}`);
  console.log(`  ${c.gray}└─────────────────────────────────────────────────┘${c.reset}`);

  // Inflection
  if (inflection) {
    const dir = inflection.direction === 'worsened' ? `${c.red}▼` : `${c.green}▲`;
    console.log(`\n  ${dir} ${c.bold}${inflection.summary}${c.reset}`);
  }

  // Model split one-liner
  if (modelRouting?.available) {
    console.log(`\n  ${c.blue}◉${c.reset} ${c.dim}Models:${c.reset} ${modelRouting.opusPct}% Opus ${c.dim}·${c.reset} ${modelRouting.sonnetPct}% Sonnet ${c.dim}·${c.reset} ${modelRouting.haikuPct}% Haiku`);
  }

  // Anomalies
  if (anomalies.hasAnomalies) {
    console.log(`\n  ${c.yellow}⚠${c.reset} ${c.bold}${anomalies.anomalies.length} anomal${anomalies.anomalies.length === 1 ? 'y' : 'ies'}${c.reset}`);
    for (const a of anomalies.anomalies.slice(0, 3)) {
      console.log(`    ${c.dim}${a.date}${c.reset}  ${c.white}$${a.cost.toFixed(0)}${c.reset}  ${c.red}+$${a.deviation.toFixed(0)}${c.reset}`);
    }
  }

  // Recommendations (top 3, compact)
  if (recommendations.length > 0) {
    console.log(`\n  ${c.bold}Recommendations${c.reset}`);
    for (const r of recommendations.slice(0, 4)) {
      const icon = r.severity === 'critical' ? `${c.red}●${c.reset}` : r.severity === 'warning' ? `${c.yellow}●${c.reset}` : r.severity === 'positive' ? `${c.green}●${c.reset}` : `${c.blue}●${c.reset}`;
      const savings = r.savings ? ` ${c.dim}(${r.savings})${c.reset}` : '';
      console.log(`    ${icon} ${r.title}${savings}`);
    }
  }
}
