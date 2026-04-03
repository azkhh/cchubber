/**
 * Inflection Point Detection
 * Finds BOTH the worst degradation AND best improvement in cache efficiency.
 * Prioritizes degradation — that's what users care about ("why is my usage draining?").
 */
export function detectInflectionPoints(dailyFromJSONL) {
  if (!dailyFromJSONL || dailyFromJSONL.length < 5) return null;

  const sorted = [...dailyFromJSONL]
    .filter(d => d.outputTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 5) return null;

  const minWindow = 3;
  let worstDegradation = null;
  let worstScore = 0;
  let bestImprovement = null;
  let bestScore = 0;

  for (let i = minWindow; i <= sorted.length - minWindow; i++) {
    const before = sorted.slice(Math.max(0, i - 7), i);
    const after = sorted.slice(i, Math.min(sorted.length, i + 7));

    const beforeRatio = computeRatio(before);
    const afterRatio = computeRatio(after);

    if (beforeRatio === 0 || afterRatio === 0) continue;

    if (afterRatio > beforeRatio) {
      // Degradation (ratio went UP = worse)
      const mult = afterRatio / beforeRatio;
      if (mult > worstScore && mult >= 1.5) {
        worstScore = mult;
        worstDegradation = buildResult(sorted[i].date, beforeRatio, afterRatio, mult, 'worsened', before.length, after.length);
      }
    } else {
      // Improvement (ratio went DOWN = better)
      const mult = beforeRatio / afterRatio;
      if (mult > bestScore && mult >= 1.5) {
        bestScore = mult;
        bestImprovement = buildResult(sorted[i].date, beforeRatio, afterRatio, mult, 'improved', before.length, after.length);
      }
    }
  }

  // Return degradation as primary (that's the problem), improvement as secondary
  const primary = worstDegradation || bestImprovement;
  if (!primary) return null;

  primary.secondary = worstDegradation ? bestImprovement : null;
  return primary;
}

function buildResult(date, beforeRatio, afterRatio, multiplier, direction, beforeDays, afterDays) {
  const mult = Math.round(multiplier * 10) / 10;
  const dirLabel = direction === 'worsened' ? 'dropped' : 'improved';
  return {
    date,
    beforeRatio,
    afterRatio,
    multiplier: mult,
    direction,
    beforeDays,
    afterDays,
    summary: `Your cache efficiency ${dirLabel} ${mult}x starting ${formatDate(date)}. Before: ${beforeRatio.toLocaleString()}:1. After: ${afterRatio.toLocaleString()}:1.`,
  };
}

function computeRatio(days) {
  const totalOutput = days.reduce((s, d) => s + (d.outputTokens || 0), 0);
  const totalCacheRead = days.reduce((s, d) => s + (d.cacheReadTokens || 0), 0);
  return totalOutput > 0 ? Math.round(totalCacheRead / totalOutput) : 0;
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
