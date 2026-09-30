import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Monthly list prices from claude.com/pricing and the Max plan help page, checked 29 Sep 2026 (US web prices, before tax).
const PLAN_PRICES = { pro: 20, max_5x: 100, max_20x: 200 };
const PLAN_NAMES = { pro: 'Claude Pro', max_5x: 'Claude Max 5x', max_20x: 'Claude Max 20x' };

// Reads only the plan tier and start date from ~/.claude.json. Tokens and keys in that file are never touched.
export function readPlan(override) {
  if (override) {
    const usd = Number(override);
    if (Number.isFinite(usd) && usd > 0) return { key: 'custom', name: 'your plan', monthlyUSD: usd, since: null };
  }
  const file = join(homedir(), '.claude.json');
  if (!existsSync(file)) return null;
  try {
    const acct = JSON.parse(readFileSync(file, 'utf-8')).oauthAccount || {};
    const tier = String(acct.organizationRateLimitTier || acct.userRateLimitTier || '').toLowerCase();
    const key = tier.includes('max_20x') ? 'max_20x' : tier.includes('max_5x') ? 'max_5x' : tier.includes('pro') ? 'pro' : null;
    if (!key) return null;
    return { key, name: PLAN_NAMES[key], monthlyUSD: PLAN_PRICES[key], since: acct.subscriptionCreatedAt || null };
  } catch {
    return null;
  }
}

// `d` plus `k` months, clamped to the last day of a shorter month: a plan billed on the 31st renews 28 Feb, 31 Mar, 30 Apr.
// (setUTCMonth alone rolls 31 Jan + 1 month over to 3 Mar, which silently drops February.)
function addMonths(d, k) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + k;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay)));
}

// Billing months inside the window the logs cover: every charge whose month overlaps it. Counting only the logged window
// keeps "paid" and "consumed" about the same days, since Claude Code prunes old transcripts by default.
// Charges land on the subscription's own anniversary (`since`, when ~/.claude.json has it), not on the first logged day;
// without it the first logged day stands in as the billing day.
export function monthsBilled(firstDate, lastDate, since) {
  const a = new Date(firstDate + 'T00:00:00Z');
  const b = new Date(lastDate + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  let anchor = a;
  if (since) {
    const s = new Date(String(since).slice(0, 10) + 'T00:00:00Z');
    if (!isNaN(s) && s <= b) anchor = s;
  }
  let n = 0;
  for (let k = 0; ; k++) {
    if (addMonths(anchor, k) > b) break;
    if (addMonths(anchor, k + 1) > a) n++;
  }
  return Math.max(1, n);
}
