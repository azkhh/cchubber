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

// Billing months inside the window the logs cover: the first charge plus one per monthly anniversary. Counting only the
// logged window keeps "paid" and "consumed" about the same days, since Claude Code prunes old transcripts by default.
export function monthsBilled(firstDate, lastDate) {
  const a = new Date(firstDate + 'T00:00:00Z');
  const b = new Date(lastDate + 'T00:00:00Z');
  if (isNaN(a) || isNaN(b) || b < a) return 1;
  let n = 1;
  const d = new Date(a);
  for (;;) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    if (d > b) break;
    n++;
  }
  return n;
}
