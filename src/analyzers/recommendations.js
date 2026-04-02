export function generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies) {
  const recs = [];

  // 1. CLAUDE.md size
  if (claudeMdStack.totalTokensEstimate > 8000) {
    recs.push({
      severity: 'warning',
      title: 'Large CLAUDE.md stack',
      detail: `Your CLAUDE.md files total ~${claudeMdStack.totalTokensEstimate.toLocaleString()} tokens (${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB). This is re-read on every message. At 200 messages/day, this costs ~$${claudeMdStack.costPerMessage.dailyCached200.toFixed(2)}/day cached, or $${claudeMdStack.costPerMessage.dailyUncached200.toFixed(2)}/day if cache breaks.`,
      action: 'Review your CLAUDE.md for sections that could be moved to project-level files loaded on demand.',
    });
  }

  // 2. Cache break frequency
  if (cacheHealth.totalCacheBreaks > 10) {
    const topReason = cacheHealth.reasonsRanked[0];
    recs.push({
      severity: cacheHealth.totalCacheBreaks > 50 ? 'critical' : 'warning',
      title: `${cacheHealth.totalCacheBreaks} cache breaks detected`,
      detail: `Each cache break forces a full context re-read at write prices (12.5x cache read cost). Top cause: "${topReason?.reason}" (${topReason?.count} times, ${topReason?.percentage}%).`,
      action: topReason?.reason === 'Tool schemas changed'
        ? 'Reduce MCP tool connections. Each tool add/remove invalidates the cache.'
        : topReason?.reason === 'System prompt changed'
        ? 'Avoid editing CLAUDE.md mid-session. Make changes between sessions.'
        : topReason?.reason === 'TTL expiry'
        ? 'Keep sessions active. Cache expires after 5 minutes of inactivity.'
        : 'Review cache break logs in ~/.claude/tmp/cache-break-*.diff for details.',
    });
  }

  // 3. High cache:output ratio
  if (cacheHealth.efficiencyRatio > 2000) {
    recs.push({
      severity: 'critical',
      title: `Cache efficiency ratio: ${cacheHealth.efficiencyRatio.toLocaleString()}:1`,
      detail: `For every 1 token of output, ${cacheHealth.efficiencyRatio.toLocaleString()} tokens are read from cache. Healthy range is 300-800:1. This could indicate the known Claude Code cache bug (March 2026).`,
      action: 'Check your Claude Code version. Versions around 2.1.85-2.1.90 have known cache regression bugs. Consider pinning to an earlier version.',
    });
  } else if (cacheHealth.efficiencyRatio > 1000) {
    recs.push({
      severity: 'warning',
      title: `Elevated cache ratio: ${cacheHealth.efficiencyRatio.toLocaleString()}:1`,
      detail: 'Above average but not critical. Could be large codebase exploration or heavy file reading.',
      action: 'Use /compact more frequently in long sessions. Start fresh sessions for new tasks.',
    });
  }

  // 4. Cost anomalies
  if (anomalies.hasAnomalies) {
    const spikes = anomalies.anomalies.filter(a => a.type === 'spike');
    if (spikes.length > 0) {
      const worst = spikes[0];
      recs.push({
        severity: worst.severity,
        title: `${spikes.length} cost spike${spikes.length > 1 ? 's' : ''} detected`,
        detail: `Worst: $${worst.cost.toFixed(2)} on ${worst.date} (${worst.zScore > 0 ? '+' : ''}${worst.deviation.toFixed(2)} from average of $${worst.avgCost.toFixed(2)}).${worst.cacheRatioAnomaly ? ' Cache ratio was also anomalous — likely cache bug impact.' : ''}`,
        action: 'Compare session activity on spike days. Look for long sessions without /compact, or sessions where many MCP tools were connected.',
      });
    }
  }

  // 5. Cost trend
  if (anomalies.trend === 'rising_fast') {
    recs.push({
      severity: 'critical',
      title: 'Costs rising rapidly',
      detail: 'Your recent 7-day average is significantly higher than your historical average.',
      action: 'This may be related to the March 2026 Claude Code cache bug. Check Anthropic status for updates.',
    });
  }

  // 6. Opus dominance
  const modelCosts = costAnalysis.modelCosts || {};
  const totalModelCost = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  const opusCost = Object.entries(modelCosts)
    .filter(([name]) => name.includes('opus'))
    .reduce((s, [, c]) => s + c, 0);
  const opusPercentage = totalModelCost > 0 ? (opusCost / totalModelCost) * 100 : 0;

  if (opusPercentage > 90) {
    recs.push({
      severity: 'info',
      title: `${Math.round(opusPercentage)}% of costs from Opus`,
      detail: 'Opus is the most expensive model. Subagents and simple tasks could use Sonnet or Haiku.',
      action: 'Set model: "sonnet" or "haiku" on Task tool calls for search, documentation lookup, and log analysis.',
    });
  }

  // 7. Caching savings acknowledgment
  if (cacheHealth.savings.fromCaching > 100) {
    recs.push({
      severity: 'positive',
      title: `Caching saved you ~$${cacheHealth.savings.fromCaching.toLocaleString()}`,
      detail: 'Without prompt caching, your bill would be significantly higher. The cache system is working — the question is whether it breaks too often.',
      action: 'No action needed. Keep sessions alive to maximize cache hits.',
    });
  }

  return recs;
}
