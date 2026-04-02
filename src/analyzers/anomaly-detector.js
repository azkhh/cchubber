export function detectAnomalies(costAnalysis) {
  const dailyCosts = costAnalysis.dailyCosts || [];
  if (dailyCosts.length < 3) return { anomalies: [], hasAnomalies: false };

  const costs = dailyCosts.filter(d => d.cost > 0.01).map(d => d.cost);
  if (costs.length < 3) return { anomalies: [], hasAnomalies: false };

  const mean = costs.reduce((a, b) => a + b, 0) / costs.length;
  const variance = costs.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / costs.length;
  const stdDev = Math.sqrt(variance);

  const anomalies = [];

  for (const day of dailyCosts) {
    if (day.cost < 0.01) continue;

    const zScore = stdDev > 0 ? (day.cost - mean) / stdDev : 0;

    if (Math.abs(zScore) > 2) {
      // Check cache ratio too
      const ratioAnomaly = day.cacheOutputRatio > 2000;

      anomalies.push({
        date: day.date,
        cost: day.cost,
        zScore: Math.round(zScore * 100) / 100,
        severity: Math.abs(zScore) > 3 ? 'critical' : 'warning',
        type: zScore > 0 ? 'spike' : 'dip',
        avgCost: Math.round(mean * 100) / 100,
        deviation: Math.round((day.cost - mean) * 100) / 100,
        cacheRatioAnomaly: ratioAnomaly,
        cacheOutputRatio: day.cacheOutputRatio,
      });
    }
  }

  // Trend detection: are costs increasing over time?
  let trend = 'stable';
  if (dailyCosts.length >= 7) {
    const recent = dailyCosts.slice(-7).filter(d => d.cost > 0.01);
    const older = dailyCosts.slice(0, -7).filter(d => d.cost > 0.01);
    if (recent.length > 0 && older.length > 0) {
      const recentAvg = recent.reduce((s, d) => s + d.cost, 0) / recent.length;
      const olderAvg = older.reduce((s, d) => s + d.cost, 0) / older.length;
      const change = ((recentAvg - olderAvg) / olderAvg) * 100;
      if (change > 50) trend = 'rising_fast';
      else if (change > 20) trend = 'rising';
      else if (change < -50) trend = 'dropping_fast';
      else if (change < -20) trend = 'dropping';
    }
  }

  return {
    anomalies: anomalies.sort((a, b) => b.cost - a.cost),
    hasAnomalies: anomalies.length > 0,
    stats: { mean: Math.round(mean * 100) / 100, stdDev: Math.round(stdDev * 100) / 100 },
    trend,
  };
}
