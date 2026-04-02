/**
 * Session Intelligence
 * Analyzes session patterns: length, tool density, compact usage, productivity.
 */
export function analyzeSessionIntelligence(sessionMeta, jsonlEntries) {
  if (!sessionMeta || sessionMeta.length === 0) {
    return { available: false };
  }

  const sessions = sessionMeta.filter(s => s.durationMinutes > 0);
  if (sessions.length === 0) return { available: false };

  // Basic session stats
  const durations = sessions.map(s => s.durationMinutes);
  const totalMinutes = durations.reduce((s, d) => s + d, 0);
  const avgDuration = totalMinutes / sessions.length;
  const maxDuration = Math.max(...durations);
  const longestSession = sessions.find(s => s.durationMinutes === maxDuration);

  // Sort by duration for percentile calc
  const sorted = [...durations].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  // Long sessions (>60 min) — likely need /compact
  const longSessions = sessions.filter(s => s.durationMinutes > 60);
  const longSessionPct = sessions.length > 0 ? Math.round((longSessions.length / sessions.length) * 100) : 0;

  // Tool call density per session
  const toolDensities = sessions.map(s => {
    const totalTools = Object.values(s.toolCounts || {}).reduce((sum, c) => sum + c, 0);
    return { sessionId: s.sessionId, tools: totalTools, minutes: s.durationMinutes, density: s.durationMinutes > 0 ? (totalTools / s.durationMinutes).toFixed(1) : 0 };
  });

  const avgToolsPerSession = toolDensities.reduce((s, t) => s + t.tools, 0) / sessions.length;

  // Most used tools across all sessions
  const toolTotals = {};
  for (const s of sessions) {
    for (const [tool, count] of Object.entries(s.toolCounts || {})) {
      toolTotals[tool] = (toolTotals[tool] || 0) + count;
    }
  }
  const topTools = Object.entries(toolTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Lines of code per session hour (productivity proxy)
  const totalLines = sessions.reduce((s, x) => s + x.linesAdded + x.linesRemoved, 0);
  const totalHours = totalMinutes / 60;
  const linesPerHour = totalHours > 0 ? Math.round(totalLines / totalHours) : 0;

  // Messages per session
  const totalMessages = sessions.reduce((s, x) => s + x.userMessageCount + x.assistantMessageCount, 0);
  const avgMessagesPerSession = Math.round(totalMessages / sessions.length);

  // Time-of-day distribution (from JSONL timestamps)
  const hourDistribution = new Array(24).fill(0);
  if (jsonlEntries && jsonlEntries.length > 0) {
    for (const entry of jsonlEntries) {
      if (!entry.timestamp) continue;
      try {
        const d = new Date(entry.timestamp);
        if (!isNaN(d.getTime())) {
          hourDistribution[d.getHours()]++;
        }
      } catch { /* skip */ }
    }
  }

  // Peak hours (top 3)
  const peakHours = hourDistribution
    .map((count, hour) => ({ hour, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(h => ({ hour: h.hour, label: formatHour(h.hour), count: h.count }));

  // Off-peak overlap check (5am-11am PT = 12pm-6pm UTC, roughly)
  const offPeakStart = 12; // UTC
  const offPeakEnd = 18;
  const peakOverlapMessages = hourDistribution
    .slice(offPeakStart, offPeakEnd + 1)
    .reduce((s, c) => s + c, 0);
  const totalHourMessages = hourDistribution.reduce((s, c) => s + c, 0);
  const peakOverlapPct = totalHourMessages > 0 ? Math.round((peakOverlapMessages / totalHourMessages) * 100) : 0;

  return {
    available: true,
    totalSessions: sessions.length,
    totalMinutes,
    avgDuration: Math.round(avgDuration),
    medianDuration: p50,
    p90Duration: p90,
    maxDuration,
    longestSessionProject: longestSession?.projectPath,
    longSessions: longSessions.length,
    longSessionPct,
    avgToolsPerSession: Math.round(avgToolsPerSession),
    topTools,
    linesPerHour,
    avgMessagesPerSession,
    peakHours,
    peakOverlapPct,
    hourDistribution,
  };
}

function formatHour(h) {
  if (h === 0) return '12am';
  if (h < 12) return h + 'am';
  if (h === 12) return '12pm';
  return (h - 12) + 'pm';
}
