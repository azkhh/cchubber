#!/usr/bin/env node

import { resolve, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const VERSION = PKG.version;

import { readAllJSONL, aggregateDaily, aggregateByModel, aggregateByProject } from '../readers/jsonl-reader.js';
import { readStatsCache } from '../readers/stats-cache.js';
import { readSessionMeta } from '../readers/session-meta.js';
import { readCacheBreaks } from '../readers/cache-breaks.js';
import { readClaudeMdStack } from '../readers/claude-md.js';
import { readOAuthUsage } from '../readers/oauth-usage.js';
import { analyzeUsage, fetchPricing, getLiteLLMRaw } from '../analyzers/cost-calculator.js';
import { reprice } from '../analyzers/reprice.js';
import { analyzeCacheHealth } from '../analyzers/cache-health.js';
import { detectAnomalies } from '../analyzers/anomaly-detector.js';
import { generateRecommendations } from '../analyzers/recommendations.js';
import { detectInflectionPoints } from '../analyzers/inflection-detector.js';
import { analyzeSessionIntelligence } from '../analyzers/session-intelligence.js';
import { analyzeModelRouting } from '../analyzers/model-routing.js';
import { analyzeValueTrend } from '../analyzers/value-tracker.js';
import { renderHTML } from '../renderers/html-report.js';
import { renderTerminal, vsOneLiner } from '../renderers/terminal-summary.js';
import { readPlan, monthsBilled } from '../readers/plan.js';
import { runDrift, driftForReport } from '../analyzers/drift-run.js';
import { shouldSendTelemetry, sendTelemetry, beaconConfig } from '../telemetry.js';
import { spentWellLine } from '../renderers/spent-well.js';
import { saveRun, getDelta, getHistory } from '../history.js';

const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  json: args.includes('--json'),
  noTelemetry: args.includes('--no-telemetry'),
  noOpen: args.includes('--no-open'),
  drift: args.includes('--drift'),
  vs: args.includes('--vs'),
  redact: args.includes('--redact'),
  plan: (() => { const i = args.indexOf('--plan'); return i !== -1 && args[i + 1] ? args[i + 1] : null; })(),
  output: (() => {
    const idx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  })(),
  days: (() => {
    const idx = args.indexOf('--days') !== -1 ? args.indexOf('--days') : args.indexOf('-d');
    const val = idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 30;
    return isNaN(val) ? 30 : val;
  })(),
};

if (flags.help) {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║              CC Hubber v${VERSION}                 ║
  ║  What you spent. Why you spent it. Is that    ║
  ║  normal.                                      ║
  ╚═══════════════════════════════════════════════╝

  Usage: cchubber [options]

  Options:
    --days, -d <n>     Analyze last N days (default: 30)
    --output, -o <path> Output HTML report to custom path
    --no-open          Don't auto-open the report in browser
    --json             Output raw analysis as JSON (includes reprice: your usage on other models)
    --plan <usd>       Monthly plan price, if it can't be detected
    --redact           Show drift detours as categories instead of your own words
    -h, --help         Show this help

  Examples:
    cchubber                    Scan & open HTML report
    cchubber --days 7           Last 7 days only
    cchubber -o report.html     Custom output path
    cchubber --json             Machine-readable output
    cchubber --redact           Same report, drift detours as categories only

  Nothing here needs a flag. The report that cchubber opens has a section for
  how much of your last week went to what you said you'd do (read from a
  PLAN.md, plan.md or TODO.md, computed locally), and one for
  your usage on other models.

  Your usage on other models needs no flag. The report that cchubber opens has
  a section for it: your own tokens repriced on each frontier model's list
  price, a race built from your real days, and buttons to download a card, copy
  the text or post it on X. Prices come live from LiteLLM, plus a manual entry
  for a listed model LiteLLM does not carry yet (used only until LiteLLM has
  it). Offline it uses bundled prices dated 30 Sep 2026. When a plan you wrote
  down is found (plan.md or similar) the section also shows how much of your
  last week went to it, computed locally.
  Same tokens on each model's list price, cache included. Another model would
  use a different number of tokens, so this compares prices, not outcomes.

  Shipped with Mover OS at speed.
  https://moveros.dev
`);
  process.exit(0);
}

async function main() {
  const claudeDir = getClaudeDir();

  if (!existsSync(claudeDir)) {
    console.error('\n  ✗ Claude Code data directory not found at: ' + claudeDir);
    console.error('    Make sure Claude Code is installed and has been used at least once.\n');
    process.exit(1);
  }

  // Hidden, for scripts: `--vs --json` prints only the repricing (no report work). Plain `--vs` is an alias of the normal
  // run that opens the report scrolled to its "Your usage on other models" section. Nothing needs the flag.
  if (flags.vs && flags.json) return vsJsonMode(claudeDir);

  // Hidden, for scripts: `--drift --json` prints only the drift analysis. Plain `--drift` is an alias of the normal run
  // that opens the report scrolled to its drift section. Nothing needs the flag.
  if (flags.drift && flags.json) return driftJsonMode(claudeDir);

  console.log(`
    /\\  _  /\\
   /  \\(_)/  \\   CC Hubber v${VERSION}
   \\  / ◉ \\  /   What you spent. Why. Is that normal.
    \\/  ~  \\/
  `);
  console.log('  Reading local Claude Code data...\n');

  // Read all data sources
  const jsonlEntries = readAllJSONL(claudeDir);
  const statsCache = readStatsCache(claudeDir);
  const sessionMeta = readSessionMeta(claudeDir);
  const cacheBreaks = readCacheBreaks(claudeDir);
  const claudeMdStack = readClaudeMdStack(claudeDir);
  const oauthUsage = await readOAuthUsage(claudeDir);

  if (jsonlEntries.length === 0 && !statsCache) {
    console.error('  ✗ No usage data found. Use Claude Code first, then run CC Hubber.\n');
    process.exit(1);
  }

  // Aggregate JSONL into daily + model + project views (primary data source)
  const dailyFromJSONL = aggregateDaily(jsonlEntries);
  const modelFromJSONL = aggregateByModel(jsonlEntries);
  const projectBreakdown = aggregateByProject(jsonlEntries, claudeDir);

  // Fetch dynamic pricing (LiteLLM) with hardcoded fallback
  const pricing = await fetchPricing();
  const pricingSource = pricing === null ? 'hardcoded' : 'LiteLLM';

  console.log(`  ✓ ${jsonlEntries.length.toLocaleString()} conversation entries parsed`);
  console.log(`  ✓ ${dailyFromJSONL.length} days of data found`);
  console.log(`  ✓ Pricing: ${pricingSource}`);
  console.log(`  ✓ ${sessionMeta.length} sessions found`);
  console.log(`  ✓ ${cacheBreaks.length} cache break events found`);
  console.log(`  ✓ CLAUDE.md stack: ${claudeMdStack.totalTokensEstimate.toLocaleString()} tokens (~${(claudeMdStack.totalBytes / 1024).toFixed(1)} KB)`);
  if (oauthUsage) console.log('  ✓ Live rate limits loaded');
  else console.log('  ○ Live rate limits skipped (no OAuth token)');

  // Analyze — use ALL data for the HTML (client-side JS handles filtering)
  // The --days flag sets the default view, but all data is embedded
  console.log('\n  Analyzing...\n');
  const allTimeDays = 99999; // Pass everything to the report
  const costAnalysis = analyzeUsage(statsCache, sessionMeta, allTimeDays, dailyFromJSONL, modelFromJSONL);
  const cacheHealth = analyzeCacheHealth(statsCache, cacheBreaks, allTimeDays, dailyFromJSONL);
  const anomalies = detectAnomalies(costAnalysis);
  const inflection = detectInflectionPoints(dailyFromJSONL);
  const sessionIntel = analyzeSessionIntelligence(sessionMeta, jsonlEntries);
  const modelRouting = analyzeModelRouting(costAnalysis, jsonlEntries);
  const valueTrend = analyzeValueTrend(dailyFromJSONL, costAnalysis.dailyCosts, inflection?.date);
  if (valueTrend.available) console.log(`  ✓ Value trend: ${valueTrend.avgOutputPerMsg} tokens/msg avg (${valueTrend.trend})`);

  const recommendations = generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection, sessionIntel, modelRouting, projectBreakdown);

  if (inflection) console.log(`  ✓ Inflection: ${inflection.summary}`);
  if (sessionIntel.available) console.log(`  ✓ ${sessionIntel.totalSessions} sessions analyzed (${sessionIntel.avgDuration} min avg)`);
  if (modelRouting.available) console.log(`  ✓ Model routing: ${modelRouting.opusPct}% Opus, ${modelRouting.sonnetPct}% Sonnet`);
  console.log(`  ✓ ${projectBreakdown.length} projects detected`);

  // Fetch community stats for leaderboard (non-blocking, 5s timeout, fails silently)
  let communityStats = null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch('https://cchubber-telemetry.asmirkhan087.workers.dev/stats-public', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) communityStats = await res.json();
  } catch {}
  if (communityStats) console.log(`  ✓ Community data: ${communityStats.totalReports} users from ${Object.keys(communityStats.countries || {}).length} countries`);
  else console.log('  ○ Community data unavailable (offline)');

  // Your usage on other models. Never allowed to break the normal run.
  let vsData = null;
  try {
    const live = getLiteLLMRaw();
    vsData = reprice(costAnalysis, { raw: live?.data, fetchedAt: live?.fetchedAt });
    console.log(vsData.offline ? '  ○ Other-model prices offline: bundled prices as of 30 Sep 2026' : '  ✓ Other-model prices: LiteLLM');
  } catch { vsData = null; }

  const report = {
    generatedAt: new Date().toISOString(),
    periodDays: flags.days,
    costAnalysis,
    cacheHealth,
    anomalies,
    inflection,
    sessionIntel,
    modelRouting,
    projectBreakdown,
    claudeMdStack,
    oauthUsage,
    recommendations,
    valueTrend,
    communityStats,
    reprice: vsData,
    history: getHistory(),
  };

  // Output
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  // Track over time — save run, then compare against previous
  const currentRun = saveRun(report);
  const delta = getDelta(currentRun);
  if (delta && delta.daysSince > 0) {
    console.log(`  ✓ Compared to last run (${delta.daysSince}d ago):`);
    if (delta.gradeChange) console.log(`    Grade: ${delta.gradeChange}`);
    const ratioDir = delta.ratioChange > 0 ? '↑' : delta.ratioChange < 0 ? '↓' : '→';
    console.log(`    Ratio: ${ratioDir} ${Math.abs(delta.ratioChange)} (${delta.prev.ratio}→${currentRun.ratio})`);
    const scoreDir = delta.scoreChange > 0 ? '↑' : delta.scoreChange < 0 ? '↓' : '→';
    console.log(`    Score: ${scoreDir} ${Math.abs(delta.scoreChange)} (${delta.prev.score}→${currentRun.score})`);
    console.log('');
  } else if (!delta) {
    console.log('  ○ First run — future runs will show improvement tracking\n');
  }

  renderTerminal(report);

  // One line on what the same tokens would cost elsewhere; the rest is in the report.
  try { const line = vsOneLiner(vsData); if (line) console.log(`\n  ${line}`); } catch {}

  // The report's "Did you spend them well?" strip, pointed at from the terminal.
  try { const line = spentWellLine(report); if (line) console.log(`\n  ${line}`); } catch {}

  // Anonymous telemetry (opt out: --no-telemetry or CC_HUBBER_TELEMETRY=0)
  if (shouldSendTelemetry(flags)) {
    console.log('  ○ Sharing anonymous stats...');
    await sendTelemetry(report);
    console.log('  ✓ Stats shared (opt out: --no-telemetry)');
  }

  const outputPath = flags.output || join(process.cwd(), 'cchubber-report.html');
  // Drift is part of the plain report: the last week against what you wrote down, computed locally (about 2 seconds).
  const drift = driftForReport(claudeDir, { days: flags.days === 30 ? 7 : flags.days });
  console.log(driftLine(drift));
  const vsCtx = vsData ? vsContext(vsData, drift) : null;
  const html = renderHTML(report, { vs: vsCtx, drift: { ...drift, redact: flags.redact }, telemetry: beaconConfig(flags) });
  writeFileSync(outputPath, html, 'utf-8');
  console.log(`\n  ✓ Report saved to: ${outputPath}`);

  if (!flags.noOpen) {
    openInBrowser(outputPath, flags.drift ? 'drift' : flags.vs ? 'vs' : '');
    console.log('  ✓ Opened in browser\n');
  }
}

// The terminal line for drift, honest about why there is no number when there is none.
function driftLine(d) {
  if (d.state === 'ok') return `  ✓ Drift: ${Math.round(d.drift.share * 100)}% of your last ${d.days} days went to what you said you'd do. It's in your report.`;
  if (d.state === 'no-plan') return '  ○ Drift: no written plan found. Add a PLAN.md or TODO.md with a checklist to see it in your report.';
  if (d.state === 'no-work') return `  ○ Drift: no Claude Code work in the last ${d.days} days, so nothing to measure.`;
  return '  ○ Drift: could not be read this time. No number shown.';
}

// What the "other models" section needs beyond the repricing: the plan paid for (if detected), billing months over the
// logged window, and the drift headline when a written plan was found.
function vsContext(rp, drift) {
  const plan = readPlan(flags.plan);
  const dates = rp.dailyCum.dates;
  const months = dates.length ? monthsBilled(dates[0], dates[dates.length - 1], plan?.since) : 1;
  const driftPct = drift.state === 'ok' ? Math.round(drift.drift.share * 100) : null;
  return { plan, months, driftPct };
}

function getClaudeDir() {
  const home = homedir();
  return join(home, '.claude');
}

async function vsJsonMode(claudeDir) {
  // Progress goes to stderr so stdout is clean JSON
  const log = (m) => process.stderr.write(m + '\n');
  log('  Reading local Claude Code data...');

  const jsonlEntries = readAllJSONL(claudeDir);
  const statsCache = readStatsCache(claudeDir);
  if (jsonlEntries.length === 0 && !statsCache) {
    console.error('  ✗ No usage data found. Use Claude Code first, then run CC Hubber.\n');
    process.exit(1);
  }
  const sessionMeta = readSessionMeta(claudeDir);
  const dailyFromJSONL = aggregateDaily(jsonlEntries);
  const modelFromJSONL = aggregateByModel(jsonlEntries);

  await fetchPricing();
  const live = getLiteLLMRaw();
  const costAnalysis = analyzeUsage(statsCache, sessionMeta, 99999, dailyFromJSONL, modelFromJSONL);
  const rp = reprice(costAnalysis, { raw: live?.data, fetchedAt: live?.fetchedAt });
  log(rp.offline ? '  ○ Offline: prices as of 30 Sep 2026 (bundled)' : '  ✓ Live prices from LiteLLM');
  process.stdout.write(JSON.stringify(rp, null, 2) + '\n');
}

async function driftJsonMode(claudeDir) {
  const days = flags.days === 30 ? 7 : flags.days; // 7-day week by default; --days overrides
  process.stderr.write(`  Reading the last ${days} days of local sessions...\n`);
  const drift = runDrift(claudeDir, { days });
  if (!drift.available) {
    console.error('  ✗ No agent work found in the window. Use Claude Code (or Codex) this week, then try again.\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(drift, null, 2) + '\n');
}

function openInBrowser(filePath, hash = '') {
  const p = platform();
  // A file URL lets the browser scroll to a #section; a bare path cannot carry one.
  const target = hash ? `${pathToFileURL(filePath).href}#${hash}` : filePath;
  const cmd = p === 'win32' ? `start "" "${target}"`
    : p === 'darwin' ? `open "${target}"`
    : `xdg-open "${target}"`;
  exec(cmd, (err) => { if (err) console.log('  ○ Could not auto-open browser. Open the file manually.'); });
}

main().catch((err) => {
  console.error('\n  ✗ Error:', err.message);
  process.exit(1);
});
