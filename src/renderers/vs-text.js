// Words and numbers shared by every --vs surface (terminal, page, card, post), so they cannot drift apart.
// Everything here is computed from the reprice object; nothing is a hardcoded figure.

export const FINE_PRINT = "Same tokens on each model's list price, cache included. Another model would use a different number of tokens, so this compares prices, not outcomes.";

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const usd0 = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const int = (n) => Math.round(n).toLocaleString('en-US');

/** '2026-09-30' -> '30 Sep 2026' */
export function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return isNaN(d) ? String(iso) : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** epoch ms -> '30 Sep 2026, 22:14' in the user's own time zone */
export function localStamp(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

export function period(rp) {
  const dates = rp.dailyCum?.dates || [];
  return dates.length ? { first: dates[0], last: dates[dates.length - 1] } : null;
}

export function periodLabel(rp) {
  const p = period(rp);
  if (!p) return '';
  return p.first === p.last ? dayLabel(p.first) : `${dayLabel(p.first)} to ${dayLabel(p.last)}`;
}

export function totalTokens(rp) {
  const t = rp.tokens;
  return t.input + t.output + t.cacheRead + t.cacheWrite;
}

export function tokensLabel(n) {
  return n >= 1e9 ? `${(n / 1e9).toFixed(1)} billion` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : int(n);
}

/** What a model's row is sorted and quoted by: its price today (an intro price stays the price until it ends). */
export const low = (rp) => rp.models[rp.models.length - 1];
export const high = (rp) => rp.models[0];

export function readLine(rp) {
  return `For every token Claude wrote, it read ${int(rp.readPerWrite)}.`;
}

export function cacheShareRange(rp) {
  const pcts = rp.models.map(m => Math.round(m.cacheShare * 100));
  return { lo: Math.min(...pcts), hi: Math.max(...pcts) };
}

export function cacheLine(rp) {
  const { lo, hi } = cacheShareRange(rp);
  return lo === hi ? `Cache reads and writes are ${lo}% of every bill above.` : `Cache reads and writes are ${lo}% to ${hi}% of every bill above.`;
}

// The plan cost is an estimate, never a reading of the user's invoices: the plan's US list price times the months billed.
export const PAID_FINE_PRINT = "The plan cost is an estimate: the plan's US list price (or the price you gave) before tax, times the months billed. Tax, currency, upgrades and billing dates change what you really paid. Type what you actually paid to replace it.";

// Templates the page script fills when the user types what they actually paid. {amt} and {x} are swapped for figures.
export const PAID_ACTUAL_TEXT = 'You paid {amt}.';
export const PAID_ACTUAL_POST = 'I paid {amt}.';
export const PAID_ACTUAL_CAPTION = 'what I paid';

/** { paid, estimate: true, text, post, caption } or null when no plan was detected. `months` comes from monthsBilled. */
export function paidFacts(plan, months) {
  if (!plan) return null;
  const paid = plan.monthlyUSD * months;
  const span = `${months} month${months === 1 ? '' : 's'}`;
  const isList = plan.key !== 'custom';
  const detail = isList ? `${plan.name} at the US list price of ${usd0(plan.monthlyUSD)} a month, ${span}` : `${span} at ${usd0(plan.monthlyUSD)} a month, the price you gave`;
  return {
    paid,
    estimate: true,
    text: `Estimated plan cost: about ${usd0(paid)} (${detail}).`,
    post: isList ? `Plan cost, estimated at US list price: ${usd0(paid)}.` : `Plan cost, estimated: ${usd0(paid)}.`,
    caption: isList ? 'estimated plan cost at US list price' : 'estimated plan cost',
  };
}

// 15 for 14.6, 3.5 for 3.46: one decimal only while it still says something.
export const timesLabel = (r) => (r >= 10 ? String(Math.round(r)) : r.toFixed(1).replace(/\.0$/, ''));

/** What you ran (Claude list prices) against the paid figure. `template` holds {x} for the page script. Null without both numbers. */
export function multipleFacts(ran, paid, estimate, x = null) {
  if (!(ran > 0) || !(paid > 0)) return null;
  const n = x ?? timesLabel(ran / paid);
  const text = estimate
    ? `What you ran, at Claude list prices, is about ${n} times that estimate.`
    : `What you ran, at Claude list prices, is ${n} times what you paid.`;
  return { times: ran / paid, text };
}

export function overrideRows(rp) {
  return rp.models.filter(m => m.source === 'override');
}

/** 'Prices: LiteLLM, fetched 30 Sep 2026, 22:14; Gemini 4 Argon from blog.google, 30 Sep 2026.' */
export function pricesLine(rp) {
  const head = rp.offline ? `offline, prices as of ${dayLabel(rp.snapshotDate || '2026-09-30')}` : `LiteLLM, fetched ${localStamp(rp.fetchedAt || Date.now())}`;
  const extra = overrideRows(rp).map(m => `${m.label} from ${m.sourceName || m.sourceUrl}, ${dayLabel(m.checked)}`);
  return `Prices: ${[head, ...extra].join('; ')}.`;
}

/** Text for the row of a model that has a price after an introductory period. */
export function introNote(m) {
  return m.after ? `intro price, ${usd0(m.after.total)} after` : '';
}

/** Where a provider lists no cache price and the input price was used instead, as plain sentences. */
export function filledNotes(rp) {
  const name = { cacheRead: 'cache read', cacheWrite: 'cache write' };
  const groups = {};
  for (const m of rp.models) for (const f of m.filled || []) (groups[f] = groups[f] || []).push(m.label);
  return Object.entries(groups).map(([f, labels]) => `No separate ${name[f]} price listed for ${labels.join(', ')}, so the input price is used.`);
}

export const SHARE_CMD = 'npx cchubber';

/** Greedy fit: add optional lines while the whole post (plus the command) stays inside 280 characters. The page script repeats this. */
export function assemblePost(head, optional) {
  let body = head;
  for (const line of optional.filter(Boolean)) {
    const next = `${body} ${line}`;
    if ((next + '\n\n' + SHARE_CMD).length <= 280) body = next;
  }
  if ((body + '\n\n' + SHARE_CMD).length > 280) body = head;
  return `${body}\n\n${SHARE_CMD}`;
}

export function postHead(rp) {
  const lo = low(rp), hi = high(rp);
  return `My Claude Code tokens, repriced on ${rp.models.length} frontier models: ${usd0(lo.total)} (${lo.label}) to ${usd0(hi.total)} (${hi.label}).`;
}

export function driftPost(driftPct) {
  return driftPct != null ? `${driftPct}% of my last week went to what I said I'd do.` : null;
}

/** The text for Copy text and Post on X: one text, kept inside 280 characters by adding lines only while they fit. */
export function postText(rp, { plan = null, months = 1, driftPct = null } = {}) {
  return assemblePost(postHead(rp), [readLine(rp), paidFacts(plan, months)?.post, driftPost(driftPct)]);
}
