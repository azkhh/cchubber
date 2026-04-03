/**
 * Recommendations Engine
 * Each recommendation includes estimated usage % savings.
 * Informed by community data from the March 2026 Claude Code crisis.
 */
export function generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection, sessionIntel, modelRouting) {
  const recs = [];
  const totalCost = costAnalysis.totalCost || 1;

  // 0. Inflection point
  if (inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2) {
    recs.push({
      severity: 'critical',
      title: `Cache efficiency dropped ${inflection.multiplier}x on ${inflection.date}`,
      savings: '~40-60% usage reduction after fix',
      action: 'Run: claude update. v2.1.69-2.1.89 had cache bugs. Fixed in v2.1.90.',
    });
  } else if (inflection && inflection.direction === 'improved' && inflection.multiplier >= 2) {
    recs.push({
      severity: 'positive',
      title: `Efficiency improved ${inflection.multiplier}x on ${inflection.date}`,
      savings: 'Already saving',
      action: 'Your cache efficiency improved. Likely a version update or workflow change.',
    });
  }

  // 1. Model routing — biggest actionable saving for most users
  const modelCosts = costAnalysis.modelCosts || {};
  const totalModelCost = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  const opusCost = Object.entries(modelCosts).filter(([n]) => n.toLowerCase().includes('opus')).reduce((s, [, c]) => s + c, 0);
  const opusPct = totalModelCost > 0 ? Math.round((opusCost / totalModelCost) * 100) : 0;

  if (opusPct > 80) {
    const savingsPct = Math.round(opusPct * 0.4 * 0.8); // 40% of Opus routable, 80% cheaper
    recs.push({
      severity: 'warning',
      title: `${opusPct}% usage is Opus — route subagents to Sonnet`,
      savings: `~${savingsPct}% usage reduction`,
      action: `Set model: "sonnet" on Task/subagent calls. Sonnet handles search, file reads, docs, and simple edits at same quality. Community-verified: limits lasted 3-5x longer.`,
    });
  }

  // 2. CLAUDE.md bloat
  if (claudeMdStack.totalTokensEstimate > 8000) {
    const excessTokens = claudeMdStack.totalTokensEstimate - 4000;
    const savingsPct = Math.min(15, Math.round(excessTokens / claudeMdStack.totalTokensEstimate * 20));
    recs.push({
      severity: claudeMdStack.totalTokensEstimate > 15000 ? 'critical' : 'warning',
      title: `CLAUDE.md is ${Math.round(claudeMdStack.totalTokensEstimate / 1000)}K tokens — trim to <4K`,
      savings: `~${savingsPct}% per-message reduction`,
      action: 'Re-read on every turn. Move rarely-used rules to project files. Use skills/hooks instead of inline instructions. Community target: under 200 lines.',
    });
  }

  // 3. Compaction frequency — community's #1 session management tip
  if (sessionIntel?.available && sessionIntel.avgToolsPerSession > 25) {
    recs.push({
      severity: 'warning',
      title: `Avg ${sessionIntel.avgToolsPerSession} tool calls/session — compact more often`,
      savings: '~15-25% usage reduction',
      action: 'Use /compact every 30-40 tool calls. Context bloat compounds — each message re-reads the full history. Community tip: compacting at 40 calls saves 20%+ on long sessions.',
    });
  }

  // 4. Fresh sessions per task
  if (sessionIntel?.available && sessionIntel.longSessionPct > 30) {
    recs.push({
      severity: 'warning',
      title: `${sessionIntel.longSessionPct}% of sessions over 60 min — start fresh more often`,
      savings: '~10-20% usage reduction',
      action: `One task, one session. Your p90 is ${sessionIntel.p90Duration}min, longest ${sessionIntel.maxDuration}min. Starting fresh resets context and maximizes cache hits. Cheaper than a bloated session.`,
    });
  }

  // 5. Cache ratio warning
  if (cacheHealth.efficiencyRatio > 1500) {
    recs.push({
      severity: 'critical',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — update Claude Code`,
      savings: '~40-60% usage reduction',
      action: 'Run: claude update. v2.1.89 had cache bugs that inflated ratios 10-20x. Community-verified: v2.1.90 dropped usage from 80-100% to 5-7% of Max quota.',
    });
  } else if (cacheHealth.efficiencyRatio > 800) {
    recs.push({
      severity: 'info',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — slightly elevated`,
      savings: '~5-10% with optimization',
      action: 'Healthy range: 300-800:1. Reduce by compacting more often, starting fresh sessions, and avoiding --resume on older CC versions.',
    });
  }

  // 6. Peak hour overlap
  if (sessionIntel?.available && sessionIntel.peakOverlapPct > 40) {
    recs.push({
      severity: 'info',
      title: `${sessionIntel.peakOverlapPct}% of work during throttled hours`,
      savings: '~30% longer session limits',
      action: 'Anthropic throttles 5-hour limits during 5am-11am PT weekdays. Shift heavy work (refactors, test gen) to off-peak for 30%+ longer limits.',
    });
  }

  // 7. .claudeignore — prevents reading node_modules etc
  recs.push({
    severity: 'info',
    title: 'Create .claudeignore to exclude build artifacts',
    savings: '~5-10% per context load',
    action: 'Prevents CC from reading node_modules/, dist/, *.lock, __pycache__/. Each context load scans your project tree — excluding junk saves tokens every turn.',
  });

  // 8. Cost anomalies
  if (anomalies.hasAnomalies) {
    const spikes = anomalies.anomalies.filter(a => a.type === 'spike');
    if (spikes.length > 0) {
      const worst = spikes[0];
      recs.push({
        severity: worst.severity,
        title: `${spikes.length} cost spike${spikes.length > 1 ? 's' : ''} — worst $${worst.cost.toFixed(0)} on ${worst.date}`,
        savings: 'Preventable with monitoring',
        action: 'Watch the first 1-2 messages of each session. If a single message burns 3-5% of quota, restart immediately. GitHub #38029 documents phantom 652K output token bugs.',
      });
    }
  }

  // 9. Cache savings (positive)
  if (cacheHealth.savings?.fromCaching > 100) {
    recs.push({
      severity: 'positive',
      title: `Cache saved ~$${cacheHealth.savings.fromCaching.toLocaleString()} in equivalent API costs`,
      savings: 'Working as intended',
      action: 'Prompt caching is saving you significantly. Keep sessions alive, avoid mid-session CLAUDE.md edits and MCP tool changes to maximize hits.',
    });
  }

  return recs.slice(0, 6);
}
