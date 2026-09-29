import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { monthsBilled } from '../readers/plan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')).version;

function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WORDS = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
const fmtUSD = (n) => '$' + (n >= 1000 || Number.isInteger(n) ? Math.round(n).toLocaleString('en-US') : n.toFixed(2));
const fmtDate = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return isNaN(d) ? iso : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`; };
const fmtBig = (n) => n >= 1e9 ? (n / 1e9).toFixed(1) + ' billion' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' million' : Math.round(n).toLocaleString('en-US');
const word = (n) => n < WORDS.length ? WORDS[n] : String(n);

function familyShares(modelCosts) {
  const fam = {};
  let total = 0;
  for (const [name, cost] of Object.entries(modelCosts || {})) {
    if (!(cost > 0)) continue;
    const f = /opus/i.test(name) ? 'Opus' : /sonnet/i.test(name) ? 'Sonnet' : /haiku/i.test(name) ? 'Haiku' : /fable/i.test(name) ? 'Fable' : null;
    if (!f) continue;
    fam[f] = (fam[f] || 0) + cost;
    total += cost;
  }
  return Object.entries(fam).map(([f, c]) => ({ family: f, pct: total ? Math.round(c / total * 100) : 0 })).sort((a, b) => b.pct - a.pct);
}

// Each risk factor is a true sentence about this user's own logs, and it only appears when its data clears the bar.
function riskFactors(report, plan) {
  const { costAnalysis, cacheHealth, inflection, sessionIntel } = report;
  const out = [];
  const top = familyShares(costAnalysis.modelCosts)[0];
  if (top && top.pct >= 50) out.push([`We depend on a single supplier.`, `All of our spend went to Anthropic, ${top.pct}% of it to ${top.family}.`]);
  const peak = costAnalysis.peakDay;
  if (peak && plan && peak.cost >= plan.monthlyUSD) {
    const n = Math.floor(peak.cost / plan.monthlyUSD);
    out.push([`One day cost more than ${word(n)} month${n === 1 ? '' : 's'} of our subscription.`, `On ${fmtDate(peak.date)}, we consumed ${fmtUSD(peak.cost)} of Claude across ${peak.messageCount.toLocaleString('en-US')} replies.`]);
  } else if (peak) {
    out.push([`Our costs are concentrated.`, `On ${fmtDate(peak.date)} alone, we consumed ${fmtUSD(peak.cost)} of Claude.`]);
  }
  const hours = sessionIntel?.hourDistribution;
  if (Array.isArray(hours) && hours.length === 24) {
    const total = hours.reduce((a, b) => a + b, 0);
    const night = hours.slice(0, 5).reduce((a, b) => a + b, 0);
    const peakHour = hours.indexOf(Math.max(...hours));
    const label = peakHour === 0 ? 'midnight' : peakHour === 12 ? 'noon' : peakHour < 12 ? `${peakHour}am` : `${peakHour - 12}pm`;
    if (total && night / total >= 0.2) out.push([`We do our best work at ${label}.`, `${Math.round(night / total * 100)}% of our Claude usage happened between midnight and 5am.`]);
  }
  if (inflection && inflection.direction === 'worsened' && inflection.multiplier >= 2) {
    out.push([`Our cache efficiency fell ${inflection.multiplier}x on ${fmtDate(inflection.date)}, and we kept going.`, `The week before, we re-read ${inflection.beforeRatio.toLocaleString('en-US')} tokens for every token we got back. The week after, ${inflection.afterRatio.toLocaleString('en-US')}.`]);
  }
  const saved = cacheHealth?.savings?.fromCaching || 0;
  if (saved > costAnalysis.totalCost) {
    // cache-health prices every cached token at Opus rates, so this is an estimate and is shown rounded
    out.push([`Caching is the only thing keeping this affordable.`, `Without it, the same work would have cost roughly ${fmtUSD(Math.round((costAnalysis.totalCost + saved) / 1000) * 1000)} at list price.`]);
  }
  const maxMin = sessionIntel?.maxDuration || 0;
  if (maxMin >= 1440) out.push([`Our longest session spanned ${word(Math.round(maxMin / 1440))} days.`, `We did not close the terminal.`]);
  return out.slice(0, 5);
}

export function renderS1(report, { plan = null, name = null, showProject = false } = {}) {
  const { costAnalysis, cacheHealth, generatedAt } = report;
  const days = costAnalysis.dailyCosts || [];
  const first = days[0]?.date, last = days[days.length - 1]?.date;
  const consumed = costAnalysis.totalCost || 0;
  const months = first && last ? monthsBilled(first, last) : 1;
  const paid = plan ? plan.monthlyUSD * months : null;
  const multiple = paid ? consumed / paid : null;
  const company = (name ? String(name).trim() : 'You').toUpperCase() + ', INC.';
  const dated = fmtDate((generatedAt || new Date().toISOString()).slice(0, 10));
  const cacheRead = costAnalysis.totals?.cacheReadTokens ?? cacheHealth?.totals?.cacheRead ?? 0;
  const peak = costAnalysis.peakDay;
  const risks = riskFactors(report, plan);
  // Use of proceeds names the top project by output, only when asked, since repo names can be private
  let proceeds = null;
  if (showProject && report.projectBreakdown?.length) {
    const byOut = [...report.projectBreakdown].sort((x, y) => (y.outputTokens || 0) - (x.outputTokens || 0));
    const all = byOut.reduce((t, p) => t + (p.outputTokens || 0), 0);
    if (all && byOut[0].name) proceeds = { name: byOut[0].name, pct: Math.round((byOut[0].outputTokens || 0) / all * 100) };
  }

  const rows = [
    paid !== null ? ['Paid to Anthropic', `${fmtUSD(paid)}`, `${esc(plan.name)}, ${months} month${months === 1 ? '' : 's'}`] : null,
    ['Claude consumed at API list prices', fmtUSD(consumed), `${costAnalysis.activeDays} active days`],
    cacheRead ? ['Cached tokens read', fmtBig(cacheRead), ''] : null,
    peak ? ['Largest single day', fmtUSD(peak.cost), fmtDate(peak.date)] : null,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(company)} Form S-1 (parody) | CC Hubber</title>
<style>
  :root { --ink:#111; --paper:#fff; --desk:#e8e5de; --red:#c1121f; --rule:#111; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--desk); color:var(--ink); font-family:"Times New Roman", Times, "Liberation Serif", serif; }
  .wrap { padding:40px 16px 64px; display:flex; justify-content:center; }
  .paper { position:relative; width:820px; max-width:100%; background:var(--paper); padding:56px 64px 44px 92px; box-shadow:0 1px 2px rgba(0,0,0,.08), 0 12px 40px rgba(60,50,30,.14); }
  .herring { position:absolute; left:26px; top:56px; bottom:44px; width:40px; writing-mode:vertical-rl; transform:rotate(180deg); color:var(--red); font-size:10.5px; line-height:1.35; text-align:center; font-style:italic; }
  .dated { text-align:right; font-size:12px; font-style:italic; margin:0 0 26px; }
  .c { text-align:center; }
  .agency { font-size:13px; font-weight:700; letter-spacing:.08em; line-height:1.5; }
  .form { font-size:26px; font-weight:700; letter-spacing:.14em; margin:14px 0 2px; }
  .act { font-size:12px; font-weight:700; letter-spacing:.06em; }
  hr { border:0; border-top:1.5px solid var(--rule); margin:18px 0; }
  hr.thin { border-top-width:.75px; margin:12px 0; }
  .prospectus { font-size:13px; font-weight:700; letter-spacing:.3em; margin-top:22px; }
  .co { font-size:44px; font-weight:700; letter-spacing:.02em; margin:6px 0 2px; line-height:1.05; }
  .exact { font-size:12px; font-style:italic; }
  .hero { margin:30px 0 8px; }
  .hero .n { font-size:78px; font-weight:700; letter-spacing:-.01em; line-height:1; }
  .hero .k { font-size:15px; margin-top:8px; }
  .hero .x { display:inline-block; margin-top:16px; font-size:22px; font-weight:700; border:1.5px solid var(--ink); padding:4px 14px; }
  table { width:100%; border-collapse:collapse; font-size:15px; margin:6px 0 2px; }
  td { padding:6px 0; vertical-align:baseline; }
  td.l { width:auto; }
  td.l span { background:var(--paper); padding-right:6px; }
  td.l::after { content:""; }
  td.v { text-align:right; font-weight:700; white-space:nowrap; padding-left:10px; width:1%; }
  td.m { text-align:right; font-size:12.5px; font-style:italic; color:#333; white-space:nowrap; padding-left:14px; width:1%; }
  .lead { position:relative; }
  .lead::before { content:""; position:absolute; left:0; right:0; bottom:10px; border-bottom:1px dotted #777; z-index:0; }
  .lead span { position:relative; z-index:1; }
  h2 { font-size:15px; font-weight:700; letter-spacing:.18em; text-align:center; margin:26px 0 10px; }
  .risk { font-size:15px; line-height:1.45; margin:0 0 10px; }
  .risk b { font-style:italic; }
  .foot { font-size:11.5px; line-height:1.45; color:#333; margin-top:22px; }
  .cmd { font-family:ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size:13px; background:#f3f1ec; padding:2px 7px; border-radius:3px; color:#111; }
  .gen { display:flex; justify-content:space-between; align-items:baseline; margin-top:14px; font-size:12.5px; }
  @media (max-width:640px) {
    .paper { padding:36px 20px 30px 52px; }
    .herring { left:12px; width:30px; font-size:9px; }
    .co { font-size:30px; } .hero .n { font-size:52px; } .form { font-size:21px; }
    table { font-size:13.5px; } td.m { display:none; }
  }
</style></head>
<body><div class="wrap"><article class="paper" id="s1">
  <div class="herring">The information in this prospectus is not complete and may be changed. We may not stop until the weekly limit resets. This prospectus is not an offer to sell anything and is not soliciting an offer to buy anything. It is a receipt.</div>
  <p class="dated">Subject to Completion. Preliminary Prospectus dated ${esc(dated)}</p>
  <div class="c agency">UNITED STATES<br>TOKENS AND EXCHANGE COMMISSION<br><span style="font-weight:400;font-style:italic;letter-spacing:0">~/.claude, Your Terminal</span></div>
  <div class="c form">FORM S-1</div>
  <div class="c act">REGISTRATION STATEMENT UNDER THE CLAUDE CODE ACT</div>
  <hr>
  <div class="c prospectus">PROSPECTUS</div>
  <div class="c co">${esc(company)}</div>
  <div class="c exact">(Exact name of heavy user as specified in its CLAUDE.md)</div>
  <div class="c hero">
    <div class="n">${fmtUSD(consumed)}</div>
    <div class="k">of Claude consumed at API list prices${paid !== null ? `, against ${fmtUSD(paid)} paid` : ''}</div>
    ${multiple ? `<div class="x">${multiple >= 10 ? Math.round(multiple) : multiple.toFixed(1)}&times; what we paid</div>` : ''}
  </div>
  <hr class="thin">
  <table>${rows.map(r => `<tr><td class="l lead"><span>${esc(r[0])}</span></td><td class="v">${esc(r[1])}</td><td class="m">${r[2]}</td></tr>`).join('')}</table>
  ${proceeds ? `<h2>USE OF PROCEEDS</h2><p class="risk" style="text-align:center">${proceeds.pct}% of our output went to one project: <b style="font-style:normal">${esc(proceeds.name)}</b>.</p>` : ''}
  ${risks.length ? `<h2>RISK FACTORS</h2>${risks.map(([h, b]) => `<p class="risk"><b>${esc(h)}</b> ${esc(b)}</p>`).join('')}` : ''}
  <hr class="thin">
  <p class="foot">Anthropic&rsquo;s own prospectus, as reported by Reuters on September 28, 2026, says two customers made up nearly a quarter of its 2025 revenue. We are not one of them. Figures come from this machine&rsquo;s Claude Code logs${first ? ` (${esc(fmtDate(first))} to ${esc(fmtDate(last))})` : ''}, priced at public API rates, which are not Anthropic&rsquo;s own costs. This is a parody, not a securities filing.</p>
  <div class="gen"><span>Get yours: <span class="cmd">npx cchubber --s1</span></span><span style="font-style:italic">CC Hubber v${esc(PKG_VERSION)}</span></div>
</article></div></body></html>`;
}
