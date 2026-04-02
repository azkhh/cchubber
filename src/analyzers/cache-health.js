export function analyzeCacheHealth(statsCache, cacheBreaks, days) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  // Cache break analysis
  const reasonCounts = {};
  let totalBreaks = 0;

  for (const brk of cacheBreaks) {
    totalBreaks++;
    for (const reason of brk.reasons) {
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
    }
  }

  // Sort reasons by frequency
  const reasonsRanked = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, percentage: totalBreaks > 0 ? Math.round(count / totalBreaks * 100) : 0 }));

  // Cache efficiency from stats cache
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalInput = 0;
  let totalOutput = 0;

  if (statsCache?.modelUsage) {
    for (const usage of Object.values(statsCache.modelUsage)) {
      totalCacheRead += usage.cacheReadInputTokens || 0;
      totalCacheWrite += usage.cacheCreationInputTokens || 0;
      totalInput += usage.inputTokens || 0;
      totalOutput += usage.outputTokens || 0;
    }
  }

  // Cache hit rate: what % of input tokens were served from cache
  const totalInputAttempts = totalCacheRead + totalCacheWrite + totalInput;
  const cacheHitRate = totalInputAttempts > 0 ? (totalCacheRead / totalInputAttempts) * 100 : 0;

  // Cache efficiency ratio: cache reads per output token (lower = more efficient)
  const efficiencyRatio = totalOutput > 0 ? Math.round(totalCacheRead / totalOutput) : 0;

  // Grade calculation
  const grade = calculateGrade(efficiencyRatio, totalBreaks, days);

  // Estimated cost savings from caching
  // Without cache: all cache reads would be standard input ($5/M for Opus)
  // With cache: reads are $0.50/M
  const savingsFromCache = totalCacheRead / 1_000_000 * (5.0 - 0.50);

  // Cost wasted from cache breaks (rough estimate)
  // Each cache break forces a full re-read at write price ($6.25/M) instead of read price ($0.50/M)
  // Estimate ~200K tokens re-cached per break
  const wastedFromBreaks = totalBreaks * 200_000 / 1_000_000 * (6.25 - 0.50);

  return {
    totalCacheBreaks: totalBreaks,
    reasonsRanked,
    cacheHitRate: Math.round(cacheHitRate * 10) / 10,
    efficiencyRatio,
    grade,
    savings: {
      fromCaching: Math.round(savingsFromCache),
      wastedFromBreaks: Math.round(wastedFromBreaks),
    },
    totals: {
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
      input: totalInput,
      output: totalOutput,
    },
  };
}

function calculateGrade(ratio, breaks, days) {
  // Grade based on efficiency ratio + break frequency
  let score = 100;

  // Penalize high cache:output ratio
  if (ratio > 3000) score -= 40;
  else if (ratio > 2000) score -= 30;
  else if (ratio > 1000) score -= 20;
  else if (ratio > 500) score -= 10;

  // Penalize high break frequency
  const breaksPerDay = days > 0 ? breaks / days : 0;
  if (breaksPerDay > 20) score -= 30;
  else if (breaksPerDay > 10) score -= 20;
  else if (breaksPerDay > 5) score -= 10;

  if (score >= 90) return { letter: 'A', color: '#10b981', label: 'Excellent' };
  if (score >= 75) return { letter: 'B', color: '#22d3ee', label: 'Good' };
  if (score >= 60) return { letter: 'C', color: '#f59e0b', label: 'Fair' };
  if (score >= 40) return { letter: 'D', color: '#f97316', label: 'Poor' };
  return { letter: 'F', color: '#ef4444', label: 'Critical' };
}
