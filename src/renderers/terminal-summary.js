export function renderTerminal(report) {
  const { costAnalysis, cacheHealth, anomalies, claudeMdStack, recommendations } = report;

  const grade = cacheHealth.grade || { letter: '?', label: 'Unknown' };
  const totalCost = costAnalysis.totalCost || 0;

  console.log('  ╔═══════════════════════════════════════════════╗');
  console.log(`  ║  Grade: ${grade.letter} (${grade.label})`.padEnd(50) + '║');
  console.log(`  ║  Total: $${totalCost.toFixed(2)} over ${costAnalysis.activeDays} active days`.padEnd(50) + '║');
  console.log(`  ║  Avg/day: $${(costAnalysis.avgDailyCost || 0).toFixed(2)}`.padEnd(50) + '║');
  console.log(`  ║  Cache ratio: ${cacheHealth.efficiencyRatio ? cacheHealth.efficiencyRatio.toLocaleString() + ':1' : 'N/A'}`.padEnd(50) + '║');
  console.log(`  ║  Cache breaks: ${cacheHealth.totalCacheBreaks || 0}`.padEnd(50) + '║');
  console.log(`  ║  CLAUDE.md: ~${claudeMdStack.totalTokensEstimate.toLocaleString()} tokens`.padEnd(50) + '║');
  console.log('  ╚═══════════════════════════════════════════════╝');

  if (anomalies.hasAnomalies) {
    console.log(`\n  ⚠ ${anomalies.anomalies.length} anomal${anomalies.anomalies.length === 1 ? 'y' : 'ies'} detected:`);
    for (const a of anomalies.anomalies.slice(0, 3)) {
      console.log(`    ${a.date}: $${a.cost.toFixed(2)} (${a.deviation > 0 ? '+' : ''}$${a.deviation.toFixed(2)} from avg)`);
    }
  }

  if (recommendations.length > 0) {
    console.log('\n  Recommendations:');
    for (const r of recommendations.slice(0, 3)) {
      const icon = r.severity === 'critical' ? '✗' : r.severity === 'warning' ? '!' : r.severity === 'positive' ? '✓' : '·';
      console.log(`    ${icon} ${r.title}`);
    }
  }
}
