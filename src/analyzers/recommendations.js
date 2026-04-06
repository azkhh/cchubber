/**
 * Recommendations Engine
 * Each recommendation includes estimated usage % savings.
 * Informed by community data from the March 2026 Claude Code crisis
 * and anonymous telemetry from 33+ real users (community averages).
 */
export function generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection, sessionIntel, modelRouting, projectBreakdown) {
  const recs = [];
  const totalCost = costAnalysis.totalCost || 1;

  // Community benchmarks from telemetry (33 users, Apr 2026)
  const community = {
    avgRatio: 680,
    avgOpusPct: 69,
    avgClaudeMdTokens: 1892,
    avgSessionMin: 36,
    avgSubagentPct: 40,
    avgHookCount: 2.8,
  };

  // 0. Inflection point — most critical signal
  if (inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2) {
    recs.push({
      severity: 'critical',
      title: `Cache efficiency dropped ${inflection.multiplier}x on ${inflection.date}`,
      savings: `~40-60% usage reduction after fix`,
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
  const opusPct = modelRouting?.opusPct || 0;
  if (opusPct > 80) {
    const diff = opusPct - community.avgOpusPct;
    recs.push({
      severity: 'warning',
      title: `${opusPct}% usage is Opus — route subagents to Sonnet`,
      savings: `~${Math.round(opusPct * 0.4 * 0.8)}% usage reduction`,
      action: `Set model: "sonnet" on Task/subagent calls. Sonnet handles search, file reads, docs, and simple edits at same quality. Community-verified: limits lasted 3-5x longer. Community average: ${community.avgOpusPct}% Opus.`,
    });
  }

  // 2. CLAUDE.md bloat — with community comparison
  if (claudeMdStack.totalTokensEstimate > 4000) {
    const multiplier = (claudeMdStack.totalTokensEstimate / community.avgClaudeMdTokens).toFixed(1);
    const excessK = Math.round((claudeMdStack.totalTokensEstimate - 2000) / 1000);
    recs.push({
      severity: claudeMdStack.totalTokensEstimate > 10000 ? 'critical' : 'warning',
      title: `CLAUDE.md is ${Math.round(claudeMdStack.totalTokensEstimate / 1000)}K tokens — trim to <4K`,
      savings: `saves ~${excessK}K tokens/msg`,
      action: `Re-read on every turn. Move rarely-used rules to project files. Use skills/hooks instead of inline instructions. Community target: under 200 lines. Your config is ${multiplier}x the community average of ${Math.round(community.avgClaudeMdTokens / 1000)}K tokens.`,
    });
  }

  // 3. Project cost hotspot — identifies the most expensive project
  if (projectBreakdown && projectBreakdown.length > 1) {
    const sorted = [...projectBreakdown].sort((a, b) => (b.totalCost || 0) - (a.totalCost || 0));
    const top = sorted[0];
    if (top && top.totalCost > 0) {
      const pct = Math.round((top.totalCost / totalCost) * 100);
      if (pct > 40) {
        recs.push({
          severity: 'info',
          title: `"${top.name}" uses ${pct}% of your total spend ($${Math.round(top.totalCost)})`,
          savings: 'Focus optimization here first',
          action: `Your most expensive project. ${sorted.length} projects total. Consider whether this project needs Opus or if Sonnet would work. Splitting large tasks into smaller sessions reduces context bloat.`,
        });
      }
    }
  }

  // 4. Session length — compare to community
  if (sessionIntel?.available && sessionIntel.avgDuration > 60) {
    const multiplier = (sessionIntel.avgDuration / community.avgSessionMin).toFixed(1);
    recs.push({
      severity: 'warning',
      title: `Avg session ${sessionIntel.avgDuration} min — ${multiplier}x community average`,
      savings: '~15-25% usage reduction',
      action: `Community average is ${community.avgSessionMin} min. Longer sessions accumulate context bloat. Use /compact every 30-40 tool calls. Start fresh sessions for new tasks. Your p90 is ${sessionIntel.p90Duration} min.`,
    });
  }

  // 5. Cache ratio — with community context
  if (cacheHealth.efficiencyRatio > 1500) {
    recs.push({
      severity: 'critical',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — update Claude Code`,
      savings: '~40-60% usage reduction',
      action: `Community average: ${community.avgRatio}:1. Your ratio is ${(cacheHealth.efficiencyRatio / community.avgRatio).toFixed(1)}x worse. v2.1.89 had cache bugs. Run: claude update.`,
    });
  } else if (cacheHealth.efficiencyRatio > 800) {
    recs.push({
      severity: 'info',
      title: `Cache ratio ${cacheHealth.efficiencyRatio.toLocaleString()}:1 — slightly elevated`,
      savings: '~5-10% with optimization',
      action: `Community average: ${community.avgRatio}:1. Reduce by compacting more often, starting fresh sessions, and avoiding --resume on older CC versions.`,
    });
  }

  // 6. Cost anomalies
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

  // 7. .claudeignore
  recs.push({
    severity: 'info',
    title: 'Create .claudeignore to exclude build artifacts',
    savings: '~5-10% per context load',
    action: 'Prevents CC from reading node_modules/, dist/, *.lock, __pycache__/. Each context load scans your project tree — excluding junk saves tokens every turn.',
  });

  // 8. Avoid --resume on older versions
  if (cacheHealth.efficiencyRatio > 600) {
    recs.push({
      severity: 'info',
      title: 'Avoid --resume and --continue flags',
      savings: '~$0.15 saved per resume',
      action: 'These flags caused full prompt-cache misses in v2.1.69-2.1.89 (~$0.15 per resume on 500K context). Fixed in v2.1.90. Copy your last message and start fresh instead.',
    });
  }

  // 9. Prompt specificity
  recs.push({
    severity: 'info',
    title: 'Be specific in prompts — reduces tokens up to 10x',
    savings: '~20-40% usage reduction',
    action: 'Instead of "fix the auth bug", say "fix JWT validation in src/auth/validate.ts line 42". Specific prompts avoid codebase-wide scans. Community-verified: 10x reduction per prompt.',
  });

  // 10. Peak hour overlap
  if (sessionIntel?.available && sessionIntel.peakOverlapPct > 40) {
    recs.push({
      severity: 'info',
      title: `${sessionIntel.peakOverlapPct}% of work during throttled hours`,
      savings: '~30% longer session limits',
      action: 'Anthropic throttles 5-hour limits during 5am-11am PT weekdays. Shift heavy work (refactors, test gen) to off-peak for 30%+ longer limits.',
    });
  }

  // 11. Disconnect unused MCP tools
  if (sessionIntel?.available && sessionIntel.topTools?.some(t => t.name?.includes('mcp__'))) {
    recs.push({
      severity: 'info',
      title: 'Disconnect unused MCP servers',
      savings: '~5-15% per cache break avoided',
      action: 'Each MCP tool schema change invalidates the prompt cache. Only connect servers you actively need. Disconnect the rest between sessions.',
    });
  }

  // 12. Cache savings (positive)
  if (cacheHealth.savings?.fromCaching > 100) {
    recs.push({
      severity: 'positive',
      title: `Cache saved ~$${cacheHealth.savings.fromCaching.toLocaleString()} in equivalent API costs`,
      savings: 'Working as intended',
      action: 'Prompt caching is saving you significantly. Keep sessions alive, avoid mid-session CLAUDE.md edits and MCP tool changes to maximize hits.',
    });
  }

  return recs.slice(0, 10);
}
