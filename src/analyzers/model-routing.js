/**
 * Model Routing Analysis
 * Detects model usage patterns and estimates savings from better routing.
 */
export function analyzeModelRouting(costAnalysis, jsonlEntries) {
  const modelCosts = costAnalysis.modelCosts || {};
  const totalCost = Object.values(modelCosts).reduce((s, c) => s + c, 0);

  if (totalCost < 0.01) return { available: false };

  // Classify models into tiers
  const tiers = { opus: 0, sonnet: 0, haiku: 0, other: 0 };
  const tierCosts = { opus: 0, sonnet: 0, haiku: 0, other: 0 };

  for (const [name, cost] of Object.entries(modelCosts)) {
    const lower = name.toLowerCase();
    if (lower.includes('opus')) { tiers.opus++; tierCosts.opus += cost; }
    else if (lower.includes('sonnet')) { tiers.sonnet++; tierCosts.sonnet += cost; }
    else if (lower.includes('haiku')) { tiers.haiku++; tierCosts.haiku += cost; }
    else { tiers.other++; tierCosts.other += cost; }
  }

  const opusPct = totalCost > 0 ? Math.round((tierCosts.opus / totalCost) * 100) : 0;
  const sonnetPct = totalCost > 0 ? Math.round((tierCosts.sonnet / totalCost) * 100) : 0;
  const haikuPct = totalCost > 0 ? Math.round((tierCosts.haiku / totalCost) * 100) : 0;

  // Estimate savings: assume 40% of Opus work could be done by Sonnet at 60% cost
  // Conservative estimate — Sonnet handles file reads, simple edits, search well
  const opusCost = tierCosts.opus;
  const routableToSonnet = opusCost * 0.4; // 40% of Opus work is routable
  const sonnetEquivalentCost = routableToSonnet * 0.6; // Sonnet is ~60% of Opus cost
  const estimatedSavings = routableToSonnet - sonnetEquivalentCost;

  // Detect subagent usage from JSONL (subagent messages often use different models)
  let subagentMessages = 0;
  let mainMessages = 0;
  if (jsonlEntries && jsonlEntries.length > 0) {
    for (const entry of jsonlEntries) {
      const model = (entry.model || '').toLowerCase();
      // Subagents typically use sonnet/haiku, main thread uses opus
      if (model.includes('sonnet') || model.includes('haiku')) {
        subagentMessages++;
      } else {
        mainMessages++;
      }
    }
  }

  const subagentPct = (subagentMessages + mainMessages) > 0
    ? Math.round((subagentMessages / (subagentMessages + mainMessages)) * 100)
    : 0;

  // Model diversity score (0-100): higher = better routing
  const modelCount = Object.keys(modelCosts).length;
  let diversityScore = 0;
  if (modelCount >= 3 && opusPct < 80) diversityScore = 90;
  else if (modelCount >= 2 && opusPct < 90) diversityScore = 60;
  else if (opusPct > 95) diversityScore = 20;
  else diversityScore = 40;

  return {
    available: true,
    opusPct,
    sonnetPct,
    haikuPct,
    estimatedSavings: Math.round(estimatedSavings),
    subagentPct,
    diversityScore,
    tierCosts,
    totalCost,
  };
}
