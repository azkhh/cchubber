import https from 'https';
import { platform, arch } from 'os';

// Anonymous usage telemetry — no PII, no tokens, no file contents.
// Opt out: npx cchubber --no-telemetry
// Or set env: CC_HUBBER_TELEMETRY=0

const TELEMETRY_URL = process.env.CC_HUBBER_TELEMETRY_URL || 'https://cchubber-telemetry.azkhh.workers.dev/collect';

export function shouldSendTelemetry(flags) {
  if (flags.noTelemetry) return false;
  if (process.env.CC_HUBBER_TELEMETRY === '0') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;
  return true;
}

export function sendTelemetry(report) {
  const payload = {
    v: '0.3.1',
    ts: new Date().toISOString(),
    os: platform(),
    arch: arch(),

    // Aggregated stats — no file contents, no project names, no personal data
    // Usage profile
    grade: report.cacheHealth?.grade?.letter || '?',
    cacheRatio: report.cacheHealth?.efficiencyRatio || 0,
    cacheHitRate: report.cacheHealth?.cacheHitRate || 0,
    cacheBreaks: report.cacheHealth?.totalCacheBreaks || 0,
    estimatedBreaks: report.cacheHealth?.estimatedBreaks || 0,
    cacheSaved: report.cacheHealth?.savings?.fromCaching || 0,
    cacheWasted: report.cacheHealth?.savings?.wastedFromBreaks || 0,

    // Cost & scale
    activeDays: report.costAnalysis?.activeDays || 0,
    totalCostBucket: costBucket(report.costAnalysis?.totalCost || 0),
    avgDailyCost: Math.round(report.costAnalysis?.avgDailyCost || 0),
    peakDayCost: Math.round(report.costAnalysis?.peakDay?.cost || 0),
    totalMessages: report.costAnalysis?.dailyCosts?.reduce((s, d) => s + (d.messageCount || 0), 0) || 0,

    // Model usage (key for understanding subscription behavior)
    modelSplit: modelSplitSummary(report.costAnalysis?.modelCosts || {}),
    modelCount: Object.keys(report.costAnalysis?.modelCosts || {}).length,
    opusPct: report.modelRouting?.opusPct || 0,
    sonnetPct: report.modelRouting?.sonnetPct || 0,
    haikuPct: report.modelRouting?.haikuPct || 0,
    subagentPct: report.modelRouting?.subagentPct || 0,

    // CLAUDE.md (how people configure their AI)
    claudeMdTokens: report.claudeMdStack?.totalTokensEstimate || 0,
    claudeMdBytes: report.claudeMdStack?.totalBytes || 0,
    claudeMdSections: report.claudeMdStack?.globalSections?.length || 0,
    claudeMdFiles: report.claudeMdStack?.files?.length || 0,
    claudeMdCostCached: report.claudeMdStack?.costPerMessage?.cached || 0,
    claudeMdCostUncached: report.claudeMdStack?.costPerMessage?.uncached || 0,

    // Session patterns (how people work)
    sessionCount: report.sessionIntel?.totalSessions || 0,
    avgSessionMin: report.sessionIntel?.avgDuration || 0,
    medianSessionMin: report.sessionIntel?.medianDuration || 0,
    p90SessionMin: report.sessionIntel?.p90Duration || 0,
    maxSessionMin: report.sessionIntel?.maxDuration || 0,
    longSessionPct: report.sessionIntel?.longSessionPct || 0,
    avgToolsPerSession: report.sessionIntel?.avgToolsPerSession || 0,
    linesPerHour: report.sessionIntel?.linesPerHour || 0,
    peakOverlapPct: report.sessionIntel?.peakOverlapPct || 0,
    topTools: (report.sessionIntel?.topTools || []).slice(0, 6).map(t => t.name),

    // Scale indicators
    projectCount: report.projectBreakdown?.length || 0,
    anomalyCount: report.anomalies?.anomalies?.length || 0,
    trend: report.anomalies?.trend || 'stable',
    inflectionDir: report.inflection?.direction || 'none',
    inflectionMult: report.inflection?.multiplier || 0,
    entryCount: report.costAnalysis?.dailyCosts?.length || 0,
    recCount: report.recommendations?.length || 0,

    // Rate limits (if available — shows subscription tier indirectly)
    hasOauth: !!report.oauthUsage,
    rateLimit5h: report.oauthUsage?.five_hour?.utilization || null,
    rateLimit7d: report.oauthUsage?.seven_day?.utilization || null,
  };

  // Fire and forget — never blocks the CLI
  try {
    const data = JSON.stringify(payload);
    const url = new URL(TELEMETRY_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    });
    req.on('error', () => {}); // silent fail
    req.setTimeout(3000, () => req.destroy());
    req.write(data);
    req.end();
  } catch {
    // never crash on telemetry
  }
}

function costBucket(cost) {
  // Bucketed so we can't identify individuals by exact cost
  if (cost < 10) return '<10';
  if (cost < 50) return '10-50';
  if (cost < 200) return '50-200';
  if (cost < 500) return '200-500';
  if (cost < 1000) return '500-1K';
  if (cost < 5000) return '1K-5K';
  return '5K+';
}

function modelSplitSummary(modelCosts) {
  const total = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  if (total === 0) return {};
  const split = {};
  for (const [name, cost] of Object.entries(modelCosts)) {
    split[name] = Math.round((cost / total) * 100);
  }
  return split;
}
