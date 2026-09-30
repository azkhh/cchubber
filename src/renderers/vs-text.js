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

/** { paid, text } or null when no plan was detected. `months` comes from monthsBilled over the logged window. */
export function paidFacts(plan, months) {
  if (!plan) return null;
  const paid = plan.monthlyUSD * months;
  const span = `${months} month${months === 1 ? '' : 's'}`;
  const detail = plan.key === 'custom' ? `${span} at ${usd0(plan.monthlyUSD)}` : `${plan.name}, ${span}`;
  return { paid, text: `You paid about ${usd0(paid)} (${detail}).` };
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

/** The text for Copy text and Post on X: one text, kept inside 280 characters by adding lines only while they fit. */
export function postText(rp, { plan = null, months = 1, driftPct = null } = {}) {
  const lo = low(rp), hi = high(rp);
  const head = `My Claude Code tokens, repriced on ${rp.models.length} frontier models: ${usd0(lo.total)} (${lo.label}) to ${usd0(hi.total)} (${hi.label}).`;
  const optional = [
    readLine(rp),
    paidFacts(plan, months)?.text.replace(/^You paid/, 'I paid'),
    driftPct != null ? `${driftPct}% of my last week went to what I said I'd do.` : null,
  ].filter(Boolean);
  let body = head;
  for (const line of optional) {
    const next = `${body} ${line}`;
    if ((next + '\n\n' + SHARE_CMD).length <= 280) body = next;
  }
  if ((body + '\n\n' + SHARE_CMD).length > 280) body = head;
  return `${body}\n\n${SHARE_CMD}`;
}
