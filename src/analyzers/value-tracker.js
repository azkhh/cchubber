/**
 * Value Tracker — measures whether you're getting less for your money over time.
 *
 * Two core metrics:
 * - Output per message: are Claude's responses getting shorter? (model degradation)
 * - Output per dollar: are you getting less work per dollar? (pricing/caching changes)
 *
 * Uses z-score anomaly detection (2 SD) to flag days where value drops significantly.
 */

export function analyzeValueTrend(dailyFromJSONL) {
  if (!dailyFromJSONL || dailyFromJSONL.length < 3) {
    return { available: false };
  }

  // Calculate per-day metrics
  const daily = dailyFromJSONL
    .filter(d => d.outputTokens > 0 && d.messageCount > 0)
    .map(d => ({
      date: d.date,
      outputPerMsg: Math.round(d.outputTokens / d.messageCount),
      outputPerDollar: d.cost > 0 ? Math.round(d.outputTokens / d.cost) : 0,
      outputTokens: d.outputTokens,
      messageCount: d.messageCount,
      cost: d.cost || 0,
    }));

  if (daily.length < 3) return { available: false };

  // Overall averages
  const avgOutputPerMsg = Math.round(daily.reduce((s, d) => s + d.outputPerMsg, 0) / daily.length);
  const avgOutputPerDollar = daily.filter(d => d.outputPerDollar > 0).length > 0
    ? Math.round(daily.filter(d => d.outputPerDollar > 0).reduce((s, d) => s + d.outputPerDollar, 0) / daily.filter(d => d.outputPerDollar > 0).length)
    : 0;

  // Recent 7 days vs older — is value declining?
  const sorted = [...daily].sort((a, b) => a.date.localeCompare(b.date));
  const recent = sorted.slice(-7);
  const older = sorted.slice(0, -7);

  let trend = 'stable';
  let trendDetail = '';

  if (older.length >= 3) {
    const recentAvgPerMsg = Math.round(recent.reduce((s, d) => s + d.outputPerMsg, 0) / recent.length);
    const olderAvgPerMsg = Math.round(older.reduce((s, d) => s + d.outputPerMsg, 0) / older.length);

    const recentAvgPerDollar = recent.filter(d => d.outputPerDollar > 0).length > 0
      ? Math.round(recent.filter(d => d.outputPerDollar > 0).reduce((s, d) => s + d.outputPerDollar, 0) / recent.filter(d => d.outputPerDollar > 0).length)
      : 0;
    const olderAvgPerDollar = older.filter(d => d.outputPerDollar > 0).length > 0
      ? Math.round(older.filter(d => d.outputPerDollar > 0).reduce((s, d) => s + d.outputPerDollar, 0) / older.filter(d => d.outputPerDollar > 0).length)
      : 0;

    const msgChange = olderAvgPerMsg > 0 ? ((recentAvgPerMsg - olderAvgPerMsg) / olderAvgPerMsg * 100) : 0;
    const dollarChange = olderAvgPerDollar > 0 ? ((recentAvgPerDollar - olderAvgPerDollar) / olderAvgPerDollar * 100) : 0;

    if (msgChange < -20) {
      trend = 'declining';
      trendDetail = `Output per message dropped ${Math.abs(Math.round(msgChange))}% recently (${olderAvgPerMsg} → ${recentAvgPerMsg} tokens/msg)`;
    } else if (msgChange > 20) {
      trend = 'improving';
      trendDetail = `Output per message increased ${Math.round(msgChange)}% recently (${olderAvgPerMsg} → ${recentAvgPerMsg} tokens/msg)`;
    } else {
      trendDetail = `Output per message stable (${recentAvgPerMsg} tokens/msg, was ${olderAvgPerMsg})`;
    }
  }

  // Z-score anomaly detection — flag days where value drops >2 SD
  const values = daily.map(d => d.outputPerMsg);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const anomalies = [];
  if (stdDev > 0) {
    for (const d of daily) {
      const z = (d.outputPerMsg - mean) / stdDev;
      if (z < -2) {
        anomalies.push({
          date: d.date,
          type: 'low_output',
          outputPerMsg: d.outputPerMsg,
          expected: avgOutputPerMsg,
          deviation: Math.abs(Math.round(z * 10) / 10),
          detail: `${d.outputPerMsg} tokens/msg vs ${avgOutputPerMsg} avg (${Math.abs(Math.round(z * 10) / 10)}σ below)`,
        });
      }
    }
  }

  return {
    available: true,
    daily: daily.map(d => ({ date: d.date, outputPerMsg: d.outputPerMsg, outputPerDollar: d.outputPerDollar })),
    avgOutputPerMsg,
    avgOutputPerDollar,
    trend,
    trendDetail,
    anomalies,
    dayCount: daily.length,
  };
}
