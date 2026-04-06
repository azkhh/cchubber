export function analyzeCacheHealth(statsCache, cacheBreaks, days, dailyFromJSONL) {
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

  const reasonsRanked = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, percentage: totalBreaks > 0 ? Math.round(count / totalBreaks * 100) : 0 }));

  // Token totals from JSONL (primary) or stats-cache (fallback)
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalInput = 0;
  let totalOutput = 0;

  if (dailyFromJSONL && dailyFromJSONL.length > 0) {
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    for (const day of dailyFromJSONL.filter(d => d.date >= cutoffStr)) {
      totalCacheRead += day.cacheReadTokens || 0;
      totalCacheWrite += day.cacheCreationTokens || 0;
      totalInput += day.inputTokens || 0;
      totalOutput += day.outputTokens || 0;
    }
  } else if (statsCache?.modelUsage) {
    for (const usage of Object.values(statsCache.modelUsage)) {
      totalCacheRead += usage.cacheReadInputTokens || 0;
      totalCacheWrite += usage.cacheCreationInputTokens || 0;
      totalInput += usage.inputTokens || 0;
      totalOutput += usage.outputTokens || 0;
    }
  }

  // Cache hit rate: % of input tokens served from cache
  const totalInputAttempts = totalCacheRead + totalCacheWrite + totalInput;
  const cacheHitRate = totalInputAttempts > 0 ? (totalCacheRead / totalInputAttempts) * 100 : 0;

  // Efficiency ratio: cache reads per output token (higher = more re-reading)
  const efficiencyRatio = totalOutput > 0 ? Math.round(totalCacheRead / totalOutput) : 0;

  // Multi-signal grade
  const grade = calculateGrade(efficiencyRatio, totalBreaks, days, dailyFromJSONL, cacheHitRate);

  // Cost savings estimates
  const savingsFromCache = totalCacheRead / 1_000_000 * (5.0 - 0.50);
  const wastedFromBreaks = totalBreaks > 0
    ? totalBreaks * 200_000 / 1_000_000 * (6.25 - 0.50)
    : totalCacheWrite / 1_000_000 * (6.25 - 0.50);

  const estimatedBreaks = totalBreaks > 0 ? totalBreaks : Math.round(totalCacheWrite / 300_000);

  return {
    totalCacheBreaks: totalBreaks,
    estimatedBreaks,
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

function calculateGrade(allTimeRatio, breaks, days, dailyFromJSONL, cacheHitRate) {
  // Multi-signal scoring: 4 signals, weighted, each 0-100.
  // Based on token-optimizer's methodology (multi-signal composite)
  // but adapted for post-hoc analysis with the data CC Hubber has.

  // --- Signal 1: Cache hit rate (25%) ---
  // What % of input tokens came from cache. Higher = better.
  // Thresholds from token-optimizer: >=80% = 100, >=60% = 80, >=40% = 55
  let hitRateScore;
  if (cacheHitRate >= 90) hitRateScore = 100;
  else if (cacheHitRate >= 80) hitRateScore = 85;
  else if (cacheHitRate >= 60) hitRateScore = 65;
  else if (cacheHitRate >= 40) hitRateScore = 40;
  else hitRateScore = 15;

  // --- Signal 2: Efficiency ratio (30%) ---
  // Cache reads per output token. Measures how much redundant data
  // is re-read per unit of work. Lower = more efficient.
  // Calibrated against 33 real users (median ~680).
  let ratioScore;
  if (allTimeRatio <= 200) ratioScore = 100;
  else if (allTimeRatio <= 400) ratioScore = 85;
  else if (allTimeRatio <= 600) ratioScore = 70;
  else if (allTimeRatio <= 800) ratioScore = 55;
  else if (allTimeRatio <= 1000) ratioScore = 40;
  else if (allTimeRatio <= 1500) ratioScore = 25;
  else if (allTimeRatio <= 2000) ratioScore = 15;
  else ratioScore = 5;

  // --- Signal 3: Trend direction (30%) ---
  // Compare recent 7 days vs older period. Worsening = bad.
  let trendScore = 70; // default: neutral
  let recentRatio = allTimeRatio;
  let olderRatio = allTimeRatio;

  if (dailyFromJSONL && dailyFromJSONL.length >= 7) {
    const sorted = [...dailyFromJSONL].sort((a, b) => a.date.localeCompare(b.date));
    const recent = sorted.slice(-7);
    const older = sorted.slice(0, -7);

    const recentOutput = recent.reduce((s, d) => s + (d.outputTokens || 0), 0);
    const recentCacheRead = recent.reduce((s, d) => s + (d.cacheReadTokens || 0), 0);
    recentRatio = recentOutput > 0 ? Math.round(recentCacheRead / recentOutput) : 0;

    if (older.length > 0) {
      const olderOutput = older.reduce((s, d) => s + (d.outputTokens || 0), 0);
      const olderCacheRead = older.reduce((s, d) => s + (d.cacheReadTokens || 0), 0);
      olderRatio = olderOutput > 0 ? Math.round(olderCacheRead / olderOutput) : 0;
    }

    if (olderRatio > 0) {
      const change = recentRatio / olderRatio;
      if (change <= 0.5) trendScore = 100;       // improving significantly
      else if (change <= 0.8) trendScore = 85;    // improving
      else if (change <= 1.2) trendScore = 70;    // stable
      else if (change <= 2.0) trendScore = 40;    // degrading
      else trendScore = 10;                        // degrading fast
    }
  }

  // --- Signal 4: Break frequency (15%) ---
  // Cache breaks per active day. More breaks = worse.
  const activeDays = dailyFromJSONL ? dailyFromJSONL.length : (days > 0 ? days : 1);
  const estimatedBreaks = breaks > 0 ? breaks : 0;
  const breaksPerDay = activeDays > 0 ? estimatedBreaks / activeDays : 0;
  let breakScore;
  if (breaksPerDay === 0) breakScore = 100;
  else if (breaksPerDay <= 2) breakScore = 80;
  else if (breaksPerDay <= 5) breakScore = 60;
  else if (breaksPerDay <= 10) breakScore = 35;
  else breakScore = 10;

  // Weighted composite
  const composite = Math.round(
    hitRateScore * 0.15 +
    ratioScore * 0.40 +
    trendScore * 0.30 +
    breakScore * 0.15
  );

  // Severity cap: if any single signal is critically low, cap the grade.
  // Prevents a broken ratio from being hidden by high hit rate.
  const minSignal = Math.min(hitRateScore, ratioScore, trendScore, breakScore);
  let cappedComposite = composite;
  if (minSignal <= 5) cappedComposite = Math.min(cappedComposite, 38);  // cap at D
  else if (minSignal <= 15) cappedComposite = Math.min(cappedComposite, 48); // cap at C

  const signals = { hitRate: hitRateScore, ratio: ratioScore, trend: trendScore, breaks: breakScore };

  if (cappedComposite >= 75) return { letter: 'A', color: '#10b981', label: 'Excellent', score: cappedComposite, signals };
  if (cappedComposite >= 60) return { letter: 'B', color: '#22d3ee', label: 'Good', score: cappedComposite, signals };
  if (cappedComposite >= 45) return { letter: 'C', color: '#f59e0b', label: 'Fair', score: cappedComposite, signals };
  if (cappedComposite >= 30) return { letter: 'D', color: '#f97316', label: 'Poor', score: cappedComposite, signals };
  return { letter: 'F', color: '#ef4444', label: 'Critical', score: cappedComposite, signals };
}
