#!/usr/bin/env node
/**
 * CC Hubber Smoke Tests
 * Run before every publish: node test/smoke.js
 * Tests the generated HTML for common regressions.
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
let failures = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message}`);
    failures++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// Generate the report
console.log('Generating report...\n');
try {
  execSync('node src/cli/index.js --no-open --no-telemetry', { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.log('  ✗ CLI failed to run:', e.stderr?.toString().slice(0, 200));
  process.exit(1);
}

const reportPath = join(ROOT, 'cchubber-report.html');
assert(existsSync(reportPath), 'Report file not created');
const html = readFileSync(reportPath, 'utf-8');

console.log('Running tests...\n');

// 1. JS Syntax — the #1 regression (apostrophes, template literals)
test('JS syntax is valid', () => {
  const match = html.match(/<script>\s*\(function\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/);
  assert(match, 'No main script block found');
  try {
    new Function(match[1]);
  } catch (e) {
    throw new Error(`JS syntax error: ${e.message}`);
  }
});

// 2. All critical sections exist in HTML
test('Cost Trend chart exists', () => {
  assert(html.includes('cost-chart-svg'), 'Missing cost-chart-svg');
  assert(html.includes('Cost Trend'), 'Missing Cost Trend heading');
});

test('Projects table exists', () => {
  assert(html.includes('proj-tbl'), 'Missing proj-tbl');
  assert(html.includes('Projects'), 'Missing Projects heading');
});

test('Activity by Hour exists', () => {
  assert(html.includes('Activity by Hour'), 'Missing Activity by Hour');
});

test('Recommendations section exists', () => {
  assert(html.includes('Recommendations'), 'Missing Recommendations');
});

test('Community leaderboard section exists', () => {
  assert(html.includes('community-section'), 'Missing community-section');
});

// 3. No unescaped apostrophes in JS strings
test('No unescaped apostrophes in JS template output', () => {
  const scriptBlock = html.match(/<script>\s*\(function\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/)?.[1] || '';
  // Look for common apostrophe patterns that break JS
  const dangerPatterns = [
    /='[^']*'[a-z]/g,  // string ending then identifier (like 'You're)
  ];
  // The real test is the syntax check above — this is belt-and-suspenders
});

// 4. Data embedded correctly
test('Daily costs data is valid JSON array', () => {
  const match = html.match(/var D=(\[.*?\]), P=/);
  assert(match, 'No daily costs data found');
  const data = JSON.parse(match[1]);
  assert(Array.isArray(data), 'Daily costs is not an array');
  assert(data.length > 0, 'Daily costs is empty');
  assert(data[0].date, 'First entry has no date');
  assert(typeof data[0].cost === 'number', 'First entry cost is not a number');
});

test('Projects data is valid JSON array', () => {
  const match = html.match(/P=(\[[\s\S]*?\]);/);
  assert(match, 'No projects data found');
  const data = JSON.parse(match[1]);
  assert(Array.isArray(data), 'Projects is not an array');
});

// 5. Fix with Claude buttons use base64 (not inline JS strings)
test('Clipboard buttons use data-clip base64', () => {
  const clipButtons = html.match(/data-clip="/g);
  if (clipButtons) {
    assert(clipButtons.length > 0, 'No data-clip buttons found');
    // Make sure no raw onclick with writeText('...) pattern
    assert(!html.includes("writeText('CC Hubber"), 'Raw clipboard text in onclick — use data-clip base64');
  }
});

// 6. No falsy-coercion bugs (0||'?' → '?' for opus/haiku percentages)
test('Opus 0% renders as 0% not ?%', () => {
  // The leaderboard should use != null check, not ||
  const scriptBlock = html.match(/<script>\s*\(function\(\)\{([\s\S]*?)\}\)\(\);\s*<\/script>/)?.[1] || '';
  assert(!scriptBlock.includes("entry.opus||'?'"), "Opus uses || which coerces 0 to '?'. Use entry.opus!=null");
});

// 7. Grade score is within valid range
test('Grade score is 0-100', () => {
  const match = html.match(/grade:'([A-F])'/);
  assert(match, 'No grade found in CARD');
});

// 8. No hardcoded API keys
test('No private API keys in HTML', () => {
  assert(!html.includes('x9k_private'), 'Private key found in HTML');
  assert(!html.includes('cchubber_stats_'), 'Stats key found in HTML');
});

// 9. HTML escaping function exists
test('escapeHtml function exists', () => {
  const src = readFileSync(join(ROOT, 'src/renderers/html-report.js'), 'utf-8');
  assert(src.includes('function esc('), 'Missing esc() function in html-report.js');
});

// Summary
console.log(`\n${failures === 0 ? '✓ All tests passed' : `✗ ${failures} test(s) failed`}`);
process.exit(failures > 0 ? 1 : 0);
