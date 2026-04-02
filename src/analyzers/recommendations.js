/**
 * Recommendations Engine
 * Generates actionable recommendations informed by community data (March 2026 crisis).
 * Every recommendation maps to a real pattern reported by users on GitHub/Twitter/Reddit.
 */
export function generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection, sessionIntel, modelRouting) {
  const recs = [];

  // 0. Inflection point — most important signal
  if (inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2) {
    recs.push({
      severity: 'critical',
      title: `Cache efficiency dropped ${inflection.multiplier}x on ${inflection.date}`,
      detail: inflection.summary,
      action: 'Run: claude update. Versions 2.1.69-2.1.89 had a cache sentinel bug that dropped read rates from 95% to 4-17%. Fixed in v2.1.90.',
    });
  } else if (inflection && inflection.direction === 'improved' && inflection.multiplier >= 2) {
    recs.push({
      severity: 'positive',
      title: `Efficiency improved ${inflection.multiplier}x on ${inflection.date}`,
      detail: inflection.summary,
      action: 'Your cache efficiency improved here. Likely a version update or workflow change that stuck.',
    });
  }

  // 1. CLAUDE.md bloat — community-reported 10-20x cost multiplier
  if (claudeMdStack.totalTokensEstimate > 8000) {
    const dailyCost = claudeMdStack.costPerMessage?.dailyCached200;
    recs.push({
      severity: claudeMdStack.totalTokensEstimate > 15000 ? 'critical' : 'warning',
      title: `CLAUDE.md is ${Math.round(claudeMdStack.totalTokensEstimate / 1000)}K tokens`,
      detail: `Re-read on every turn. Community best practice: keep under 200 lines (~4K tokens). Yours costs ~$${dailyCost ? dailyCost.toFixed(2) : '?'}/day at 200 messages. Each cache break re-reads at 12.5x the cached price.`,
      action: 'Move rarely-used rules to project-level files. Use skills/hooks instead of inline instructions. Every 1K tokens removed saves ~$0.50/day.',
    });
  }

  // 2. Version check — the #1 fix reported by community
  if (cacheHealth.efficiencyRatio > 1500 || (inflection && inflection.direction === 'worsened')) {
    recs.push({
      severity: 'critical',
      title: 'Update Claude Code to v2.1.90+',
      detail: 'Versions 2.1.69-2.1.89 had three cache bugs: sentinel replacement error, --resume cache miss, and nested CLAUDE.md re-injection. Community-verified: usage dropped from 80-100% to 5-7% of Max quota after updating.',
      action: 'Run: claude update. If already on latest, start a fresh session — the fix only applies to new sessions.',
    });
  }

  // 3. Cache break analysis
  if (cacheHealth.totalCacheBreaks > 10) {
    const topReason = cacheHealth.reasonsRanked[0];
    recs.push({
      severity: cacheHealth.totalCacheBreaks > 50 ? 'critical' : 'warning',
      title: `${cacheHealth.totalCacheBreaks} cache invalidations`,
      detail: `Each break forces a full prompt re-read at write prices (12.5x cache read cost). ${topReason ? `Top cause: "${topReason.reason}" (${topReason.count}x, ${topReason.percentage}%).` : ''}`,
      action: topReason?.reason === 'Tool schemas changed'
        ? 'Reduce MCP server connections. Each tool schema change breaks the cache prefix. Disconnect tools you\'re not actively using.'
        : topReason?.reason === 'System prompt changed'
        ? 'Stop editing CLAUDE.md mid-session. Batch rule changes between sessions.'
        : 'Review ~/.claude/tmp/cache-break-*.diff for exact invalidation causes.',
    });
  }

  // 4. High cache:output ratio
  if (cacheHealth.efficiencyRatio > 2000) {
    recs.push({
      severity: 'critical',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — abnormally high`,
      detail: `Healthy range: 300-800:1. You\'re at ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — every output token costs ${cacheHealth.efficiencyRatio.toLocaleString()} cache read tokens. This pattern matches the March 2026 cache bug reported by thousands of users.`,
      action: 'Immediate fix: update to v2.1.90+. If already updated, avoid --resume flag and start fresh sessions per task.',
    });
  } else if (cacheHealth.efficiencyRatio > 1000) {
    recs.push({
      severity: 'warning',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — elevated`,
      detail: 'Not critical, but above the 300-800 healthy range. Common causes: large codebase exploration, many file reads without /compact, or stale sessions.',
      action: 'Use /compact every 30-40 tool calls. Start fresh sessions for each distinct task.',
    });
  }

  // 5. Opus dominance — community tip: Sonnet handles 60%+ of tasks at 1/5 cost
  const modelCosts = costAnalysis.modelCosts || {};
  const totalModelCost = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  const opusCost = Object.entries(modelCosts).filter(([n]) => n.toLowerCase().includes('opus')).reduce((s, [, c]) => s + c, 0);
  const opusPct = totalModelCost > 0 ? Math.round((opusCost / totalModelCost) * 100) : 0;

  if (opusPct > 85) {
    recs.push({
      severity: 'warning',
      title: `${opusPct}% of your usage is Opus`,
      detail: `Opus burns through your usage limit 5x faster than Sonnet per token. Sonnet 4.6 handles file reads, search, simple edits, and subagent work at the same quality. Community tip: routing routine tasks to Sonnet made usage limits last 3-5x longer.`,
      action: `Set model: "sonnet" on subagent/Task calls. Your limits could last ${Math.round(100/opusPct * 3)}x longer. Reserve Opus for complex reasoning only.`,
    });
  }

  // 6. Session length — community-reported: sessions >60 min degrade heavily
  if (sessionIntel?.available && sessionIntel.longSessionPct > 30) {
    recs.push({
      severity: 'warning',
      title: `${sessionIntel.longSessionPct}% of sessions exceed 60 minutes`,
      detail: `Long sessions accumulate context that degrades cache efficiency and response quality. Your median: ${sessionIntel.medianDuration}min, p90: ${sessionIntel.p90Duration}min, longest: ${sessionIntel.maxDuration}min.`,
      action: 'One task, one session. Use /compact for exploration, fresh session for each bug fix or feature. The cost of starting fresh is less than the cost of a bloated context.',
    });
  }

  // 7. Peak hour overlap — community-reported: 5am-11am PT has throttled limits
  if (sessionIntel?.available && sessionIntel.peakOverlapPct > 40) {
    recs.push({
      severity: 'info',
      title: `${sessionIntel.peakOverlapPct}% of your work hits throttled hours`,
      detail: 'Anthropic reduces 5-hour session limits during weekday peak hours (5am-11am PT / 12pm-6pm UTC). ~7% of users hit limits they wouldn\'t otherwise.',
      action: 'Shift token-heavy work (refactors, test generation, codebase exploration) to off-peak hours. Session limits are unchanged — only the 5-hour window shrinks.',
    });
  }

  // 8. Cost anomalies
  if (anomalies.hasAnomalies) {
    const spikes = anomalies.anomalies.filter(a => a.type === 'spike');
    if (spikes.length > 0) {
      const worst = spikes[0];
      recs.push({
        severity: worst.severity,
        title: `${spikes.length} cost spike${spikes.length > 1 ? 's' : ''} — worst: $${worst.cost.toFixed(0)} on ${worst.date}`,
        detail: `+$${worst.deviation.toFixed(0)} above your $${worst.avgCost.toFixed(0)} daily average.${worst.cacheRatioAnomaly ? ' Cache ratio was also anomalous — strongly suggests cache bug.' : ''} GitHub #38029 documents a bug where a single session generated 652K phantom output tokens ($342).`,
        action: 'Monitor the first 1-2 messages of each session. If a single message burns 3-5% of your quota, restart immediately.',
      });
    }
  }

  // 9. Positive: cache savings
  if (cacheHealth.savings?.fromCaching > 100) {
    recs.push({
      severity: 'positive',
      title: `Cache saved you ~$${cacheHealth.savings.fromCaching.toLocaleString()}`,
      detail: 'Without prompt caching, standard input pricing would have applied to all cache reads. The system is working — optimization is about reducing breaks.',
      action: 'Keep sessions alive to maximize hits. Avoid mid-session CLAUDE.md edits and MCP tool changes.',
    });
  }

  // Cap at 5 most impactful recommendations
  return recs.slice(0, 5);
}
