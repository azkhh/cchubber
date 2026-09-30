import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { FRONTIER_MODELS } from '../data/frontier-models.js';
import { PRICE_OVERRIDES } from '../data/price-overrides.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Bundled offline prices (30 Sep 2026). Read lazily so a missing file only costs the offline path.
let snapshotCache = null;
export function loadSnapshot() {
  if (!snapshotCache) snapshotCache = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'price-snapshot.json'), 'utf-8'));
  return snapshotCache;
}

const PARTS = ['input', 'output', 'cacheRead', 'cacheWrite'];

// LiteLLM lists dollars per token; 1.32e-6 * 1e6 is 1.3199999999999998 in floating point, so round to 10 significant digits.
const perMillion = (perToken) => Number((perToken * 1e6).toPrecision(10));

/** One LiteLLM entry to per-million prices exactly as listed. A price LiteLLM does not list is null. */
export function priceFromLiteLLM(entry) {
  const f = (v) => (v == null ? null : perMillion(v));
  return {
    input: f(entry.input_cost_per_token),
    output: f(entry.output_cost_per_token),
    cacheRead: f(entry.cache_read_input_token_cost),
    cacheWrite: f(entry.cache_creation_input_token_cost),
  };
}

/**
 * Apply the two fill rules and record which fields they touched.
 *   cache read missing            -> the input price (no discount assumed)
 *   cache write missing or zero   -> the input price (the provider bills cache writes as ordinary input)
 */
export function resolvePrice(p) {
  const filled = [];
  let cacheRead = p.cacheRead;
  let cacheWrite = p.cacheWrite;
  if (cacheRead == null) { cacheRead = p.input; filled.push('cacheRead'); }
  if (cacheWrite == null || cacheWrite === 0) { cacheWrite = p.input; filled.push('cacheWrite'); }
  return { price: { input: p.input, output: p.output, cacheRead, cacheWrite }, filled };
}

const usable = (p) => p && p.input > 0 && p.output > 0;

function costParts(tokens, price) {
  const parts = {
    input: tokens.input / 1e6 * price.input,
    output: tokens.output / 1e6 * price.output,
    cacheRead: tokens.cacheRead / 1e6 * price.cacheRead,
    cacheWrite: tokens.cacheWrite / 1e6 * price.cacheWrite,
  };
  return { parts, total: parts.input + parts.output + parts.cacheRead + parts.cacheWrite };
}

/**
 * Find a model's raw per-million prices. LiteLLM live data wins; a manual override is used only when LiteLLM has no
 * entry for the id; the bundled snapshot stands in when the fetch failed (and as the last resort online).
 */
function findPrice(id, { raw, snapshot, overrides }) {
  const live = raw && raw[id] ? priceFromLiteLLM(raw[id]) : null;
  if (usable(live)) return { source: 'litellm', raw: live };
  const snap = snapshot?.models?.[id];
  const ovr = overrides?.[id];
  const fromOverride = ovr?.intro ? { source: 'override', raw: { cacheRead: null, cacheWrite: null, ...ovr.intro }, ovr } : null;
  const fromSnapshot = usable(snap) ? { source: 'snapshot', raw: { cacheRead: null, cacheWrite: null, ...snap } } : null;
  const order = raw ? [fromOverride, fromSnapshot] : [fromSnapshot, fromOverride];
  return order.find(Boolean) || null;
}

/**
 * Reprice the user's own token totals on each listed model's list price.
 * `opts` exists so tests can pass a fixed price table: { raw (LiteLLM JSON or null = offline), fetchedAt, snapshot, overrides, models }.
 */
export function reprice(costAnalysis, opts = {}) {
  const raw = opts.raw || null;
  const models = opts.models || FRONTIER_MODELS;
  const overrides = opts.overrides || PRICE_OVERRIDES;
  const lookup = { raw, overrides, snapshot: opts.snapshot || safeSnapshot() };

  const t = costAnalysis.totals || {};
  const tokens = {
    input: t.inputTokens || 0,
    output: t.outputTokens || 0,
    cacheRead: t.cacheReadTokens || 0,
    cacheWrite: t.cacheWriteTokens || 0,
  };

  const rows = [];
  const dailyDays = costAnalysis.dailyCosts || [];
  for (const m of models) {
    const found = findPrice(m.id, lookup);
    if (!found) continue;
    const { price, filled } = resolvePrice(found.raw);
    const { parts, total } = costParts(tokens, price);
    const row = {
      id: m.id, label: m.label, maker: m.maker,
      price, parts, total,
      cacheShare: total > 0 ? (parts.cacheRead + parts.cacheWrite) / total : 0,
      source: found.source,
      filled,
    };
    if (found.ovr) {
      row.sourceUrl = found.ovr.sourceUrl;
      row.sourceName = found.ovr.sourceName;
      row.checked = found.ovr.checked;
      row.note = found.ovr.note;
      row.assumption = found.ovr.assumption;
      if (found.ovr.after) {
        const a = resolvePrice({ cacheRead: null, cacheWrite: null, ...found.ovr.after });
        const c = costParts(tokens, a.price);
        row.after = { price: a.price, parts: c.parts, total: c.total, filled: a.filled };
      }
    }
    rows.push(row);
  }
  rows.sort((a, b) => b.total - a.total);

  // Running total per day, from each day's per-model token counts priced at this model's rates.
  const dates = dailyDays.map(d => d.date);
  const perModel = {};
  for (const r of rows) {
    let cum = 0;
    perModel[r.id] = dailyDays.map(d => {
      for (const dm of d.models || []) {
        const tk = dm.tokens;
        if (!tk || typeof tk !== 'object') continue;
        cum += costParts({ input: tk.input || 0, output: tk.output || 0, cacheRead: tk.cacheRead || 0, cacheWrite: tk.cacheWrite || 0 }, r.price).total;
      }
      return round2(cum);
    });
  }
  let actualCum = 0;
  const actual = dailyDays.map(d => { actualCum += d.cost || 0; return round2(actualCum); });

  return {
    models: rows,
    actualListCost: costAnalysis.totalCost || 0,
    tokens,
    readPerWrite: tokens.output > 0 ? (tokens.input + tokens.cacheRead + tokens.cacheWrite) / tokens.output : 0,
    dailyCum: { dates, perModel, actual },
    fetchedAt: opts.fetchedAt ?? null,
    offline: !raw,
    ...(raw ? {} : { snapshotDate: (lookup.snapshot || {}).date || null }),
  };
}

function safeSnapshot() {
  try { return loadSnapshot(); } catch { return null; }
}

const round2 = (n) => Math.round(n * 100) / 100;
