#!/usr/bin/env node

import { resolve, join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { homedir, platform } from 'os';
import { exec } from 'child_process';

import { readAllJSONL, aggregateDaily, aggregateByModel, aggregateByProject } from '../readers/jsonl-reader.js';
import { readStatsCache } from '../readers/stats-cache.js';
import { readSessionMeta } from '../readers/session-meta.js';
import { readCacheBreaks } from '../readers/cache-breaks.js';
import { readClaudeMdStack } from '../readers/claude-md.js';
import { readOAuthUsage } from '../readers/oauth-usage.js';
import { analyzeUsage, fetchPricing } from '../analyzers/cost-calculator.js';
import { analyzeCacheHealth } from '../analyzers/cache-health.js';
import { detectAnomalies } from '../analyzers/anomaly-detector.js';
import { generateRecommendations } from '../analyzers/recommendations.js';
import { detectInflectionPoints } from '../analyzers/inflection-detector.js';
import { analyzeSessionIntelligence } from '../analyzers/session-intelligence.js';
import { analyzeModelRouting } from '../analyzers/model-routing.js';
import { renderHTML } from '../renderers/html-report.js';
import { renderTerminal } from '../renderers/terminal-summary.js';

const args = process.argv.slice(2);
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  json: args.includes('--json'),
  noOpen: args.includes('--no-open'),
  output: (() => {
    const idx = args.indexOf('--output') !== -1 ? args.indexOf('--output') : args.indexOf('-o');
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  })(),
  days: (() => {
    const idx = args.indexOf('--days') !== -1 ? args.indexOf('--days') : args.indexOf('-d');
    return idx !== -1 && args[idx + 1] ? parseInt(args[idx + 1], 10) : 30;
  })(),
};

if (flags.help) {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║              CC Hubber v0.1.0                 ║
  ║  What you spent. Why you spent it. Is that    ║
  ║  normal.                                      ║
  ╚═══════════════════════════════════════════════╝

  Usage: cchubber [options]

  Options:
    --days, -d <n>     Analyze last N days (default: 30)
    --output, -o <path> Output HTML report to custom path
    --no-open          Don't auto-open the report in browser
    --json             Output raw analysis as JSON
    -h, --help         Show this help

  Examples:
    cchubber                    Scan & open HTML report
    cchubber --days 7           Last 7 days only
    cchubber -o report.html     Custom output path
    cchubber --json             Machine-readable output

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

  console.log('\n  CC Hubber v0.1.0');
  console.log('  ─────────────────────────────');
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
  const recommendations = generateRecommendations(costAnalysis, cacheHealth, claudeMdStack, anomalies, inflection);

  if (inflection) console.log(`  ✓ Inflection: ${inflection.summary}`);
  if (sessionIntel.available) console.log(`  ✓ ${sessionIntel.totalSessions} sessions analyzed (${sessionIntel.avgDuration} min avg)`);
  if (modelRouting.available) console.log(`  ✓ Model routing: ${modelRouting.opusPct}% Opus, ${modelRouting.sonnetPct}% Sonnet`);
  console.log(`  ✓ ${projectBreakdown.length} projects detected`);

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
  };

  // Output
  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  renderTerminal(report);

  const outputPath = flags.output || join(process.cwd(), 'cchubber-report.html');
  const html = renderHTML(report);
  writeFileSync(outputPath, html, 'utf-8');
  console.log(`\n  ✓ Report saved to: ${outputPath}`);

  if (!flags.noOpen) {
    openInBrowser(outputPath);
    console.log('  ✓ Opened in browser\n');
  }
}

function getClaudeDir() {
  const home = homedir();
  return join(home, '.claude');
}

function openInBrowser(filePath) {
  const p = platform();
  const cmd = p === 'win32' ? `start "" "${filePath}"`
    : p === 'darwin' ? `open "${filePath}"`
    : `xdg-open "${filePath}"`;
  exec(cmd, (err) => { if (err) console.log('  ○ Could not auto-open browser. Open the file manually.'); });
}

main().catch((err) => {
  console.error('\n  ✗ Error:', err.message);
  process.exit(1);
});
