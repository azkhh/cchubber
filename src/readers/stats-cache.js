import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readStatsCache(claudeDir) {
  const filePath = join(claudeDir, 'stats-cache.json');
  if (!existsSync(filePath)) return null;

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    // Extract daily model tokens into a usable format
    const dailyData = [];
    const dailyTokens = data.dailyModelTokens || [];
    const dailyActivity = data.dailyActivity || [];

    // Build a map of activity data
    const activityMap = {};
    for (const entry of dailyActivity) {
      activityMap[entry.date] = entry;
    }

    for (const entry of dailyTokens) {
      const models = [];
      for (const [modelName, tokens] of Object.entries(entry.tokensByModel || {})) {
        models.push({ modelName, tokens });
      }

      const activity = activityMap[entry.date] || {};

      dailyData.push({
        date: entry.date,
        models,
        messageCount: activity.messageCount || 0,
        sessionCount: activity.sessionCount || 0,
        toolCallCount: activity.toolCallCount || 0,
      });
    }

    // Also extract the aggregate model usage with full token breakdowns
    const modelUsage = data.modelUsage || {};

    return {
      version: data.version,
      lastComputedDate: data.lastComputedDate,
      totalSessions: data.totalSessions || 0,
      totalMessages: data.totalMessages || 0,
      dailyData,
      modelUsage,
    };
  } catch (err) {
    return null;
  }
}
