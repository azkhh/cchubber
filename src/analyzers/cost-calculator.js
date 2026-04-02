// Pricing tiers from Claude Code source (per million tokens)
const PRICING = {
  // Opus 4.5/4.6 standard
  'claude-opus-4-6': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.50 },
  'claude-opus-4-5-20251101': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.50 },
  // Sonnet 4.5/4.6
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.30 },
  // Haiku 4.5
  'claude-haiku-4-5-20251001': { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.10 },
  // Fallback
  'default': { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.50 },
};

function getPricing(modelName) {
  // Try exact match first, then prefix match
  if (PRICING[modelName]) return PRICING[modelName];
  for (const [key, value] of Object.entries(PRICING)) {
    if (modelName.includes(key.replace('claude-', '').split('-')[0])) return value;
  }
  // Infer from name
  if (modelName.includes('haiku')) return PRICING['claude-haiku-4-5-20251001'];
  if (modelName.includes('sonnet')) return PRICING['claude-sonnet-4-6'];
  if (modelName.includes('opus')) return PRICING['claude-opus-4-6'];
  return PRICING['default'];
}

function calculateCost(modelName, tokens) {
  const pricing = getPricing(modelName);
  const input = (tokens.inputTokens || 0) / 1_000_000 * pricing.input;
  const output = (tokens.outputTokens || 0) / 1_000_000 * pricing.output;
  const cacheWrite = (tokens.cacheCreationInputTokens || tokens.cacheCreationTokens || 0) / 1_000_000 * pricing.cacheWrite;
  const cacheRead = (tokens.cacheReadInputTokens || tokens.cacheReadTokens || 0) / 1_000_000 * pricing.cacheRead;
  return { input, output, cacheWrite, cacheRead, total: input + output + cacheWrite + cacheRead };
}

export function analyzeUsage(statsCache, sessionMeta, days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffStr = cutoffDate.toISOString().split('T')[0];

  // Calculate per-day costs from stats cache
  const dailyCosts = [];
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let activeDays = 0;

  if (statsCache?.modelUsage) {
    // Calculate total from aggregate model usage
    for (const [modelName, usage] of Object.entries(statsCache.modelUsage)) {
      const cost = calculateCost(modelName, usage);
      totalCost += cost.total;
      totalInput += usage.inputTokens || 0;
      totalOutput += usage.outputTokens || 0;
      totalCacheRead += usage.cacheReadInputTokens || 0;
      totalCacheWrite += usage.cacheCreationInputTokens || 0;
    }
  }

  // Build daily view from dailyData
  if (statsCache?.dailyData) {
    for (const day of statsCache.dailyData) {
      if (day.date < cutoffStr) continue;

      let dayCost = 0;
      let dayOutput = 0;
      let dayCacheRead = 0;
      const modelBreakdowns = [];

      for (const model of day.models) {
        const tokens = model.tokens || {};
        const cost = calculateCost(model.modelName, {
          inputTokens: tokens.inputTokens || tokens,
          outputTokens: tokens.outputTokens || 0,
          cacheCreationInputTokens: tokens.cacheCreationInputTokens || 0,
          cacheReadInputTokens: tokens.cacheReadInputTokens || 0,
        });

        // If tokens is just a number (total), estimate breakdown
        if (typeof tokens === 'number') {
          dayCost += tokens / 1_000_000 * 0.50; // Rough estimate at cache read rate
          dayCacheRead += tokens;
        } else {
          dayCost += cost.total;
          dayOutput += tokens.outputTokens || 0;
          dayCacheRead += tokens.cacheReadInputTokens || 0;
        }

        modelBreakdowns.push({
          model: model.modelName,
          cost: typeof tokens === 'number' ? tokens / 1_000_000 * 0.50 : cost.total,
          tokens: typeof tokens === 'number' ? tokens : {
            input: tokens.inputTokens || 0,
            output: tokens.outputTokens || 0,
            cacheRead: tokens.cacheReadInputTokens || 0,
            cacheWrite: tokens.cacheCreationInputTokens || 0,
          },
        });
      }

      if (dayCost > 0.01) activeDays++;

      const ratio = dayOutput > 0 ? Math.round(dayCacheRead / dayOutput) : 0;

      dailyCosts.push({
        date: day.date,
        cost: dayCost,
        outputTokens: dayOutput,
        cacheReadTokens: dayCacheRead,
        cacheOutputRatio: ratio,
        messageCount: day.messageCount,
        sessionCount: day.sessionCount,
        toolCallCount: day.toolCallCount,
        models: modelBreakdowns,
      });
    }
  }

  // Session analysis
  const recentSessions = sessionMeta.filter(s => {
    if (!s.startTime) return true;
    return s.startTime >= cutoffStr;
  });

  const totalSessions = recentSessions.length;
  const avgSessionDuration = totalSessions > 0
    ? recentSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / totalSessions
    : 0;

  const totalLinesAdded = recentSessions.reduce((sum, s) => sum + s.linesAdded, 0);
  const totalLinesRemoved = recentSessions.reduce((sum, s) => sum + s.linesRemoved, 0);
  const totalFilesModified = recentSessions.reduce((sum, s) => sum + s.filesModified, 0);

  // Tool usage aggregation
  const toolAgg = {};
  for (const session of recentSessions) {
    for (const [tool, count] of Object.entries(session.toolCounts || {})) {
      toolAgg[tool] = (toolAgg[tool] || 0) + count;
    }
  }

  // Model cost breakdown
  const modelCosts = {};
  for (const day of dailyCosts) {
    for (const m of day.models) {
      const name = cleanModelName(m.model);
      if (!modelCosts[name]) modelCosts[name] = 0;
      modelCosts[name] += m.cost;
    }
  }

  const periodCost = dailyCosts.reduce((sum, d) => sum + d.cost, 0);
  const avgDailyCost = activeDays > 0 ? periodCost / activeDays : 0;
  const peakDay = dailyCosts.reduce((max, d) => d.cost > (max?.cost || 0) ? d : max, null);

  return {
    periodDays: days,
    activeDays,
    totalCost: periodCost,
    avgDailyCost,
    medianDailyCost: median(dailyCosts.filter(d => d.cost > 0.01).map(d => d.cost)),
    peakDay,
    dailyCosts,
    modelCosts,
    sessions: {
      total: totalSessions,
      avgDurationMinutes: avgSessionDuration,
      totalLinesAdded,
      totalLinesRemoved,
      totalFilesModified,
    },
    toolUsage: toolAgg,
    totals: {
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
    },
  };
}

function cleanModelName(name) {
  return name
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace(/-\d+$/, '');
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export { PRICING, calculateCost, cleanModelName };
