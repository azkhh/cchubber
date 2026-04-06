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

  // 1. Model routing — smart subagent delegation
  const opusPct = modelRouting?.opusPct || 0;
  const subagentPct = modelRouting?.subagentPct || 0;
  if (opusPct > 80) {
    recs.push({
      severity: 'warning',
      title: `${opusPct}% usage is Opus — delegate routine subagent work`,
      savings: `~${Math.round(opusPct * 0.3 * 0.7)}% usage reduction`,
      action: `Keep Opus for your main thread. Set model: "haiku" on file-reading/search subagents and model: "sonnet" for background code edits. Haiku handles grep, glob, and doc lookups at 30x less cost. Lower effort level (/effort low) for routine tasks. Community average: ${community.avgOpusPct}% Opus.`,
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
  // projectBreakdown has token counts but not cost. Use output tokens as proxy
  // (output tokens dominate cost at $25/M for Opus vs $5/M for input).
  if (projectBreakdown && projectBreakdown.length > 1) {
    const totalOutput = projectBreakdown.reduce((s, p) => s + (p.outputTokens || 0), 0);
    const sorted = [...projectBreakdown].sort((a, b) => (b.outputTokens || 0) - (a.outputTokens || 0));
    const top = sorted[0];
    if (top && totalOutput > 0) {
      const pct = Math.round(((top.outputTokens || 0) / totalOutput) * 100);
      if (pct > 30) {
        recs.push({
          severity: 'info',
          title: `"${top.name}" uses ${pct}% of output tokens (${sorted.length} projects total)`,
          savings: 'Focus optimization here first',
          action: `Your most active project by output. ${top.messageCount || 0} messages across ${top.sessionCount || 0} sessions. Consider whether this project needs Opus or if Sonnet would work. Splitting large tasks into smaller sessions reduces context bloat.`,
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

  // 8. Tool search setting — one-line fix from token-optimizer findings
  recs.push({
    severity: 'info',
    title: 'Enable tool search to reduce context by ~25K tokens',
    savings: '~45% context reduction',
    action: 'Add "ENABLE_TOOL_SEARCH": "true" to settings.json. Claude Code loads full JSON schemas for every tool at session start (14-20K tokens). Tool search loads them on-demand instead. One setting, instant savings.',
  });

  // 9. Cache expiry awareness
  if (cacheHealth.efficiencyRatio > 500) {
    recs.push({
      severity: 'info',
      title: 'Idle gaps > 5 min force full cache rebuild',
      savings: '~10-30% usage reduction',
      action: 'Anthropic\'s prompt cache expires after 5 minutes of inactivity. Each expired turn re-processes the full conversation at input price instead of cache price. Keep sessions active or start fresh after breaks instead of resuming stale ones.',
    });
  }

  // 10. Prompt specificity
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
