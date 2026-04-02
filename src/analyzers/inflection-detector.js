/**
 * Inflection Point Detection
 * Finds the sharpest change in cache efficiency ratio over time.
 * Outputs: "Your efficiency dropped 3.6x starting March 29. Before: 482:1. After: 1,726:1."
 */
export function detectInflectionPoints(dailyFromJSONL) {
  if (!dailyFromJSONL || dailyFromJSONL.length < 5) return null;

  const sorted = [...dailyFromJSONL]
    .filter(d => d.outputTokens > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length < 5) return null;

  // Sliding window: compare the average ratio of days before vs after each point
  // Window size: at least 3 days on each side
  const minWindow = 3;
  let bestSplit = null;
  let bestScore = 0;

  for (let i = minWindow; i <= sorted.length - minWindow; i++) {
    const before = sorted.slice(Math.max(0, i - 7), i);
    const after = sorted.slice(i, Math.min(sorted.length, i + 7));

    const beforeRatio = computeRatio(before);
    const afterRatio = computeRatio(after);

    if (beforeRatio === 0 || afterRatio === 0) continue;

    // Score = magnitude of change (either direction)
    const changeMultiplier = afterRatio > beforeRatio
      ? afterRatio / beforeRatio
      : beforeRatio / afterRatio;

    if (changeMultiplier > bestScore && changeMultiplier >= 1.5) {
      bestScore = changeMultiplier;
      bestSplit = {
        date: sorted[i].date,
        beforeRatio,
        afterRatio,
        multiplier: Math.round(changeMultiplier * 10) / 10,
        direction: afterRatio > beforeRatio ? 'worsened' : 'improved',
        beforeDays: before.length,
        afterDays: after.length,
      };
    }
  }

  if (!bestSplit) return null;

  // Build human-readable summary
  const dirLabel = bestSplit.direction === 'worsened' ? 'dropped' : 'improved';
  bestSplit.summary = `Your cache efficiency ${dirLabel} ${bestSplit.multiplier}x starting ${formatDate(bestSplit.date)}. Before: ${bestSplit.beforeRatio.toLocaleString()}:1. After: ${bestSplit.afterRatio.toLocaleString()}:1.`;

  return bestSplit;
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
