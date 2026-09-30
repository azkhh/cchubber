import { FRONTIER_MODELS } from '../data/frontier-models.js';
import {
  FINE_PRINT, PAID_FINE_PRINT, PAID_ACTUAL_TEXT, PAID_ACTUAL_POST, PAID_ACTUAL_CAPTION, SHARE_CMD, usd0, int, dayLabel, periodLabel, totalTokens, tokensLabel,
  readLine, cacheLine, paidFacts, multipleFacts, timesLabel, pricesLine, introNote, filledNotes, overrideRows, postText, postHead, driftPost,
} from './vs-text.js';

function esc(s) {
  if (s === 0) return '0';
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Bold the figures in a sentence (after escaping each piece), so the eye lands on the numbers.
function emph(text) {
  return String(text).split(/(\$[\d,]+|\d[\d,]*%(?: to \d+%)?|\d[\d,]*)(?=[.\s]|$)/)
    .map((part, i) => (i % 2 ? `<b>${esc(part)}</b>` : esc(part))).join('');
}

const REF_ID = '__ran';
const REF_LABEL = 'What you ran';
const REF_MAKER = 'Claude list price';

// ---------------------------------------------------------------------------------------------------------------
// STYLING LIVES HERE AND ONLY HERE. Every selector starts with #vs and every class is vs-prefixed, so this block can
// neither be restyled by the report around it nor restyle it. The palette is the report's own (#1b1c1d surface,
// #c0c1ff primary, #ffb690 secondary). A visual redesign should only need to touch this constant; the card colours
// are read from the same variables. Fonts are inherited from the report; nothing is fetched.
// ---------------------------------------------------------------------------------------------------------------
const FINAL_RULES = `#vs .vs-row{transition:none; transform:translateY(calc(var(--fpos) * var(--vs-row)))}
  #vs .vs-fill{width:var(--fw)}
  #vs .vs-now{display:none}
  #vs .vs-final{display:inline}`;

const CSS = `
#vs{
  --vs-surface:#1b1c1d; --vs-deep:#0d0e0f; --vs-ink:#e3e2e3; --vs-dim:#c7c4d7; --vs-faint:#908fa0;
  --vs-line:rgba(70,69,84,.25); --vs-accent:#c0c1ff; --vs-warm:#ffb690; --vs-on:#7fe0b0; --vs-bar:#8083ff; --vs-bar2:#c0c1ff;
  --vs-row:56px;
  --vs-sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --vs-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  background:var(--vs-surface); border:1px solid rgba(70,69,84,.15); border-radius:12px; padding:32px; scroll-margin-top:16px;
}
#vs .vs-head{display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap}
#vs .vs-title{margin:0; font-size:20px; line-height:1.2; font-weight:700; color:var(--vs-ink)}
#vs .vs-range{font-family:var(--vs-mono); font-size:11px; color:var(--vs-faint)}
#vs .vs-lead{margin:14px 0 0; font-size:clamp(22px,3.4vw,38px); line-height:1.1; font-weight:800; letter-spacing:-.02em; color:var(--vs-ink)}
#vs .vs-sub{margin:8px 0 0; font-size:14px; color:var(--vs-faint)}
#vs .vs-clock{display:flex; justify-content:space-between; align-items:baseline; gap:12px; margin:26px 0 8px; font-size:10px; color:var(--vs-faint); letter-spacing:.08em; text-transform:uppercase}
#vs .vs-clock b{font-family:var(--vs-mono); color:var(--vs-dim); font-weight:600; letter-spacing:0; text-transform:none; font-size:12px}

#vs .vs-race{list-style:none; margin:0; padding:0; position:relative; height:calc(var(--vs-n) * var(--vs-row)); border-top:1px solid var(--vs-line)}
#vs .vs-row{position:absolute; left:0; right:0; top:0; height:var(--vs-row); padding:0 4px; display:grid; align-items:center; column-gap:16px;
  grid-template-columns:minmax(150px,230px) 1fr 120px; grid-template-areas:"name track amt";
  transform:translateY(calc(var(--pos) * var(--vs-row))); transition:transform .75s cubic-bezier(.22,1,.32,1); border-bottom:1px solid var(--vs-line)}
#vs .vs-instant .vs-row{transition:none}
#vs .vs-name{grid-area:name; min-width:0; display:flex; flex-direction:column; gap:1px}
#vs .vs-label{font-size:14px; font-weight:700; color:var(--vs-ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
#vs .vs-meta{font-size:11px; color:var(--vs-faint); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
#vs .vs-tag{color:var(--vs-warm)}
#vs .vs-track{grid-area:track; height:8px; border-radius:8px; background:rgba(255,255,255,.05); overflow:hidden}
#vs .vs-fill{display:block; height:100%; width:0; border-radius:8px; background:linear-gradient(90deg,var(--vs-bar),var(--vs-bar2))}
#vs .vs-final{display:none}
#vs .vs-amt{grid-area:amt; text-align:right; font-family:var(--vs-mono); font-weight:700; font-size:18px; color:var(--vs-ink); font-variant-numeric:tabular-nums}
#vs .vs-ref .vs-label{color:var(--vs-warm)}
#vs .vs-ref .vs-fill{background:var(--vs-warm)}

#vs .vs-facts{margin:28px 0 0; display:flex; flex-direction:column; gap:10px}
#vs .vs-fact{margin:0; font-size:clamp(16px,2vw,21px); line-height:1.3; font-weight:600; color:var(--vs-faint)}
#vs .vs-fact b{color:var(--vs-ink); font-weight:800}
#vs .vs-fact.vs-drift b{color:var(--vs-on)}

#vs .vs-paid{margin:2px 0 0; display:flex; flex-direction:column; gap:6px; max-width:360px}
#vs .vs-plabel{font-size:13px; font-weight:700; color:var(--vs-dim)}
#vs .vs-pbox{display:flex; align-items:stretch; min-height:44px; background:var(--vs-deep); border:1px solid rgba(144,143,160,.45); border-radius:8px; overflow:hidden}
#vs .vs-pbox:focus-within{outline:2px solid var(--vs-accent); outline-offset:2px; border-color:var(--vs-accent)}
#vs .vs-cur{display:flex; align-items:center; padding:0 8px 0 14px; font-family:var(--vs-mono); font-size:16px; color:var(--vs-faint)}
#vs .vs-pin{flex:1 1 auto; min-width:0; width:100%; appearance:textfield; -moz-appearance:textfield; background:transparent; border:0; outline:0; color:var(--vs-ink);
  font-family:var(--vs-mono); font-size:16px; padding:10px 14px 10px 0}
#vs .vs-pin::-webkit-outer-spin-button, #vs .vs-pin::-webkit-inner-spin-button{-webkit-appearance:none; margin:0}
#vs .vs-pin::placeholder{color:var(--vs-faint); opacity:.7}
#vs .vs-phelp{margin:0; font-size:11px; line-height:1.5; color:var(--vs-faint)}

#vs .vs-actions{display:flex; gap:10px; flex-wrap:wrap; margin:26px 0 0}
#vs .vs-btn{appearance:none; font:inherit; font-size:13px; font-weight:700; cursor:pointer; text-decoration:none; color:var(--vs-ink); background:rgba(255,255,255,.05);
  border:1px solid rgba(70,69,84,.3); border-radius:8px; padding:10px 16px; min-height:40px; display:inline-flex; align-items:center}
#vs .vs-btn:hover{background:#292a2b}
#vs .vs-btn.vs-primary{background:var(--vs-accent); color:#1000a9; border-color:transparent}
#vs .vs-btn.vs-primary:hover{background:#d3d4ff}
#vs .vs-btn:focus-visible{outline:2px solid var(--vs-accent); outline-offset:2px}
#vs .vs-toast{min-height:18px; font-size:12px; color:var(--vs-on); margin:8px 2px 0}

#vs .vs-fine{margin-top:18px; padding-top:16px; border-top:1px solid var(--vs-line); font-size:11px; line-height:1.6; color:var(--vs-faint)}
#vs .vs-fine p{margin:0 0 6px}
#vs .vs-fine a{color:var(--vs-dim)}
#vs .vs-fine .vs-first{color:var(--vs-dim)}

@media (max-width:640px){
  #vs{--vs-row:72px; padding:20px 16px}
  #vs .vs-row{grid-template-columns:1fr auto; grid-template-areas:"name amt" "track track"; row-gap:6px; align-content:center}
  #vs .vs-amt{font-size:17px}
  #vs .vs-btn{flex:1 1 100%; justify-content:center}
  #vs .vs-paid{max-width:none}
}
/* The markup is the START of the race, so the first paint is the start. The finished values are kept in the page and
   shown by these rules for anyone who does not get the animation: reduced motion, or no script at all. */
@media (prefers-reduced-motion: reduce), (scripting: none){
  ${FINAL_RULES}
}
`;

// ---------------------------------------------------------------------------------------------------------------
// The script. Plain ES5, no template literals and no ${ so it can sit in a String.raw block. It is wrapped in an IIFE,
// reads its numbers from the #vs-data block, and touches nothing outside #vs except window.cchubberVs.
// ---------------------------------------------------------------------------------------------------------------
const SCRIPT = String.raw`
(function(){
  var VS = JSON.parse(document.getElementById('vs-data').textContent);
  var DURATION = 6000;                       // the race lasts about six seconds
  var box = document.getElementById('vs');
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var shot = /shot/.test(location.hash);     // #shot jumps to the finished state, for a clean screenshot
  var list = document.getElementById('vs-race');
  // Each counter and the clock hold two spans: .vs-now (what the script drives; $0 in the served HTML) and .vs-final.
  var clock = document.querySelector('#vs-clock .vs-now');
  var clockLabel = document.querySelector('#vs-clock-label .vs-now');
  var rows = {};
  var maxFinal = 0;
  VS.models.forEach(function(m){
    var li = list.querySelector('[data-id="' + m.id + '"]');
    rows[m.id] = { li: li, amt: li.querySelector('.vs-amt .vs-now'), fill: li.querySelector('.vs-fill'), pts: [0].concat(m.series), total: m.total };
    if (m.total > maxFinal) maxFinal = m.total;
  });
  var N = VS.dateLabels.length;

  function money(v){ return '$' + Math.round(v).toLocaleString('en-US'); }
  function place(order){ order.forEach(function(id, i){ rows[id].li.style.setProperty('--pos', i); }); }

  // One frame of the race. The curve is each model's running total by day, with a leading zero so every counter
  // starts at $0; each logged day takes an equal slice of the time.
  function frame(p){
    var x = p * N;
    var i = Math.min(N - 1, Math.floor(x));
    var f = Math.min(1, x - i);
    VS.models.forEach(function(m){
      var r = rows[m.id];
      var v = p >= 1 ? r.total : r.pts[i] + (r.pts[i + 1] - r.pts[i]) * f;
      r.amt.textContent = money(v);
      r.fill.style.width = (maxFinal ? v / maxFinal * 100 : 0).toFixed(2) + '%';
    });
    clock.textContent = VS.dateLabels[Math.min(N - 1, Math.max(0, Math.ceil(x) - 1))];
  }

  function settle(){
    frame(1); place(VS.sortedOrder);
    clock.textContent = VS.dateLabels[N - 1]; clockLabel.textContent = 'Your real days, replayed';
  }

  function run(){
    list.classList.add('vs-instant'); place(VS.startOrder); frame(0); clockLabel.textContent = 'Replaying your real days';
    void list.offsetWidth; list.classList.remove('vs-instant');
    var t0 = null;
    function tick(ts){
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / DURATION);
      frame(p);
      if (p < 1) requestAnimationFrame(tick); else setTimeout(settle, 250);
    }
    requestAnimationFrame(tick);
  }

  // The served HTML is already the first frame (everyone at $0, in the listed order), so finished numbers never flash.
  // The race starts once a fair share of the block is on screen: 15% of it, or half the viewport for a tall block on a
  // short screen. If that is already true on load it starts at once.
  var started = false;
  function go(){ if (started) return; started = true; window.removeEventListener('scroll', check); window.removeEventListener('resize', check); run(); }
  function enough(seen, height, vh){ return seen > 0 && height > 0 && (seen / height >= 0.15 || seen >= vh * 0.5); }
  // The visible height is clientHeight: on a phone, a wide table further down makes innerHeight (the layout viewport)
  // taller than the screen, and the block would count as seen while it is still below the fold.
  function inView(){
    var r = list.getBoundingClientRect(), vh = document.documentElement.clientHeight || window.innerHeight;
    return enough(Math.min(r.bottom, vh) - Math.max(r.top, 0), r.height, vh);
  }
  var ticking = false;
  function check(){ if (ticking || started) return; ticking = true; requestAnimationFrame(function(){ ticking = false; if (inView()) go(); }); }
  if (reduce || shot || N < 1) {
    settle();
  } else {
    list.classList.add('vs-instant'); place(VS.startOrder); frame(0); void list.offsetWidth; list.classList.remove('vs-instant');
    clockLabel.textContent = 'Replaying your real days';
    // Armed on load, not at parse time: before the page's styles are in, the block looks near the top of the screen and
    // the race would start where nobody is looking. From then on it starts on the first scroll that shows enough of it.
    var arm = function(){
      if (started) return;
      if (inView()) { go(); return; }
      window.addEventListener('scroll', check, { passive: true }); window.addEventListener('resize', check);
    };
    if (document.readyState === 'complete') arm(); else window.addEventListener('load', arm);
  }
  if (location.hash === '#vs') { window.addEventListener('load', function(){ setTimeout(function(){ box.scrollIntoView(); }, 60); }); }

  // ---- the card: 1200 x 675, drawn on a canvas from the same numbers ----
  function css(n){ return getComputedStyle(box).getPropertyValue(n).trim(); }
  function rr(g, x, y, w, h, r){ g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function wrap(g, text, x, y, maxW, lh){
    var words = text.split(' '), line = '', yy = y;
    words.forEach(function(w){
      var t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lh; } else { line = t; }
    });
    if (line) { g.fillText(line, x, yy); yy += lh; }
    return yy;
  }
  function drawCard(cv){
    cv.width = 1200; cv.height = 675;
    var g = cv.getContext('2d'), C = VS.card;
    var sans = css('--vs-sans') || 'sans-serif', mono = css('--vs-mono') || 'monospace';
    var ink = css('--vs-ink'), dim = css('--vs-dim'), faint = css('--vs-faint'), accent = css('--vs-accent'), on = css('--vs-on'), warm = css('--vs-warm'), bar = css('--vs-bar'), bar2 = css('--vs-bar2'), line = css('--vs-line');
    g.fillStyle = '#121315'; g.fillRect(0, 0, 1200, 675);
    var gr = g.createRadialGradient(600, -60, 30, 600, -60, 800);
    gr.addColorStop(0, 'rgba(192,193,255,0.16)'); gr.addColorStop(1, 'rgba(192,193,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 1200, 675);
    g.strokeStyle = line; g.lineWidth = 2; rr(g, 14, 14, 1172, 647, 28); g.stroke();
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';

    g.fillStyle = accent; g.font = '800 15px ' + sans; if ('letterSpacing' in g) g.letterSpacing = '4px';
    g.fillText('CC HUBBER', 56, 62); if ('letterSpacing' in g) g.letterSpacing = '0px';
    g.textAlign = 'right'; g.fillStyle = faint; g.font = '15px ' + mono; g.fillText(C.period, 1144, 62);
    g.textAlign = 'left';
    g.fillStyle = ink; g.font = '800 44px ' + sans; g.fillText(C.title, 56, 122);
    g.fillStyle = dim; g.font = '22px ' + sans; g.fillText(C.sub, 56, 158);

    // the sorted bills
    var top = 190, rowH = 54, nameX = 56, barX = 300, barW = 300, amtX = 744;
    var max = 0; C.bills.forEach(function(b){ if (b.total > max) max = b.total; });
    C.bills.forEach(function(b, i){
      var y = top + i * rowH;
      g.fillStyle = ink; g.font = '700 23px ' + sans; g.textAlign = 'left'; g.fillText(b.label, nameX, y + 28);
      if (b.note) { g.fillStyle = warm; g.font = '14px ' + sans; g.fillText(b.note, nameX, y + 46); }
      g.fillStyle = 'rgba(255,255,255,0.06)'; rr(g, barX, y + 14, barW, 14, 7); g.fill();
      var w = Math.max(10, barW * b.total / max);
      var lg = g.createLinearGradient(barX, 0, barX + w, 0); lg.addColorStop(0, bar); lg.addColorStop(1, bar2);
      g.fillStyle = lg; rr(g, barX, y + 14, w, 14, 7); g.fill();
      g.textAlign = 'right'; g.fillStyle = ink; g.font = '800 25px ' + mono; g.fillText(b.amount, amtX, y + 30);
    });

    // the right-hand panel: read per write, what was paid, drift
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.035)'; rr(g, 800, 150, 344, 456, 22); g.fill();
    g.strokeStyle = line; g.lineWidth = 1.5; rr(g, 800, 150, 344, 456, 22); g.stroke();
    var y = 268;
    g.fillStyle = accent; g.font = '800 104px ' + mono; g.fillText(C.read, 828, y);
    g.fillStyle = dim; g.font = '21px ' + sans; y = wrap(g, C.readCaption, 828, y + 34, 290, 27);
    if (C.paid) {
      y += 18; g.fillStyle = ink; g.font = '800 52px ' + mono; g.fillText(C.paid.amount, 828, y + 30);
      g.fillStyle = dim; g.font = '19px ' + sans; y = wrap(g, C.paid.caption, 828, y + 58, 290, 25);
    }
    if (C.drift) {
      y += 18; g.fillStyle = on; g.font = '800 52px ' + mono; g.fillText(C.drift.pct, 828, y + 30);
      g.fillStyle = dim; g.font = '19px ' + sans; y = wrap(g, C.drift.caption, 828, y + 58, 290, 25);
    }

    g.fillStyle = faint; g.font = '14px ' + sans; g.textAlign = 'left'; g.fillText(C.fine, 56, 644);
    g.textAlign = 'right'; g.fillStyle = accent; g.font = '700 16px ' + mono; g.fillText(C.cmd, 1144, 644);
    g.textAlign = 'left';
  }

  var toastEl = document.getElementById('vs-toast'), toastT = null;
  function toast(msg){ toastEl.textContent = msg; clearTimeout(toastT); toastT = setTimeout(function(){ toastEl.textContent = ''; }, 2600); }

  function download(){
    var cv = document.createElement('canvas'); drawCard(cv);
    cv.toBlob(function(blob){
      if (!blob) { toast('Could not draw the card.'); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'cchubber-vs.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 4000);
      toast('Card saved.');
    }, 'image/png');
  }
  function copy(){
    function fallback(){
      var t = document.createElement('textarea'); t.value = VS.text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(t); toast(ok ? 'Copied.' : 'Could not copy. Use Post on X instead.');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(VS.text).then(function(){ toast('Copied.'); }, fallback); } else { fallback(); }
  }
  // ---- what you actually paid: typed here, used here, never stored or sent ----
  var paidIn = document.getElementById('vs-paid-in');
  var paidEl = document.getElementById('vs-paid-line'), multEl = document.getElementById('vs-mult-line'), pxEl = document.getElementById('vs-px');
  var W = VS.words;
  var est = { paid: paidEl.innerHTML, paidHidden: paidEl.hidden, mult: multEl.innerHTML, multHidden: multEl.hidden, card: VS.card.paid, text: VS.text };
  var api = { drawCard: drawCard, text: VS.text };
  function times(r){ return r >= 10 ? String(Math.round(r)) : r.toFixed(1).replace(/\.0$/, ''); }
  function fill(tpl, key, val){ return tpl.replace(key, function(){ return val; }); }   // a function, so the $ in $1,127 is literal
  function assemble(head, optional){
    var body = head;
    optional.forEach(function(l){ if (!l) return; var next = body + ' ' + l; if ((next + '\n\n' + VS.cmd).length <= 280) body = next; });
    if ((body + '\n\n' + VS.cmd).length > 280) body = head;
    return body + '\n\n' + VS.cmd;
  }
  function applyPaid(){
    var raw = paidIn.value, v = raw === '' ? NaN : Number(raw);
    if (isFinite(v) && v > 0 && v < 1e9) {
      var amt = money(v);
      paidEl.innerHTML = fill(W.paidHtml, '{amt}', amt); paidEl.hidden = false;
      if (VS.ran > 0) { multEl.innerHTML = fill(W.multHtml, '{x}', times(VS.ran / v)); multEl.hidden = false; } else { multEl.hidden = true; }
      VS.card.paid = { amount: amt, caption: W.actualCaption };
      VS.text = assemble(VS.post.head, [VS.post.read, fill(W.actualPost, '{amt}', amt), VS.post.drift]);
    } else {
      paidEl.innerHTML = est.paid; paidEl.hidden = est.paidHidden;
      multEl.innerHTML = est.mult; multEl.hidden = est.multHidden;
      VS.card.paid = est.card; VS.text = est.text;
    }
    pxEl.href = 'https://x.com/intent/post?text=' + encodeURIComponent(VS.text);
    api.text = VS.text;
  }
  paidIn.addEventListener('input', applyPaid);
  document.getElementById('vs-dl').addEventListener('click', download);
  document.getElementById('vs-cp').addEventListener('click', copy);
  document.getElementById('vs-replay').addEventListener('click', function(){ if (reduce) { settle(); } else { run(); } });
  window.cchubberVs = api;   // lets a test or a screenshot script draw the card directly
})();
`;

/**
 * "Your usage on other models": the race, the facts and the card buttons, as one block (style + markup + data + script)
 * for the main report. Offline: no fetches, no fonts, no external scripts.
 * `ctx`: { plan, months, driftPct (null unless a stated plan computed it) }.
 */
export function renderVsBlock(rp, { plan = null, months = 1, driftPct = null } = {}) {
  const paid = paidFacts(plan, months);
  const text = postText(rp, { plan, months, driftPct });
  const mult = paid ? multipleFacts(rp.actualListCost, paid.paid, true) : null;
  // First occurrence only: the figure that is the answer (the list price later in the sentence stays plain). A function
  // replacer, because a string replacement would read the $ in "$800" as a pattern.
  const boldFirst = (str, figure) => esc(str).replace(esc(figure), (m) => `<b>${m}</b>`);
  const driftLine = driftPct != null ? `${driftPct}% of your last week went to what you said you'd do.` : null;

  // Race rows: every model plus what the user actually ran. They start in the listed order and settle sorted.
  const all = [
    ...rp.models.map(m => ({ id: m.id, label: m.label, maker: m.maker, total: m.total, note: introNote(m), series: rp.dailyCum.perModel[m.id] })),
    { id: REF_ID, label: REF_LABEL, maker: REF_MAKER, total: rp.actualListCost, note: '', series: rp.dailyCum.actual, ref: true },
  ];
  const listIdx = (id) => { const i = FRONTIER_MODELS.findIndex(f => f.id === id); return i === -1 ? 999 : i; };
  const startOrder = [REF_ID, ...[...rp.models].sort((a, b) => listIdx(a.id) - listIdx(b.id)).map(m => m.id)];
  const sortedOrder = [...all].sort((a, b) => b.total - a.total).map(m => m.id);
  const max = Math.max(...all.map(x => x.total), 1);

  // The markup is the START of the race (listed order, $0, empty bars), so the first paint is the start and the finished
  // numbers never flash. The finish sits beside it in --fpos, --fw and .vs-final, for no-JS and reduced motion (FINAL_RULES).
  const rowsHtml = all.map(m => `
    <li class="vs-row${m.ref ? ' vs-ref' : ''}" data-id="${esc(m.id)}" style="--pos:${startOrder.indexOf(m.id)};--fpos:${sortedOrder.indexOf(m.id)};--fw:${(m.total / max * 100).toFixed(2)}%">
      <div class="vs-name"><span class="vs-label">${esc(m.label)}</span><span class="vs-meta">${esc(m.maker)}${m.note ? ` &middot; <span class="vs-tag">${esc(m.note)}</span>` : ''}</span></div>
      <div class="vs-track" aria-hidden="true"><i class="vs-fill"></i></div>
      <div class="vs-amt"><span class="vs-now">$0</span><span class="vs-final">${esc(usd0(m.total))}</span></div>
    </li>`).join('');

  const dateLabels = rp.dailyCum.dates.map(dayLabel);
  const data = {
    models: all.map(m => ({ id: m.id, total: m.total, series: m.series })),
    startOrder, sortedOrder, dateLabels, text,
    card: {
      title: 'My Claude Code tokens, repriced',
      sub: `${tokensLabel(totalTokens(rp))} tokens, each model's list price`,
      period: periodLabel(rp),
      bills: rp.models.map(m => ({ label: m.label, total: m.total, amount: usd0(m.total), note: introNote(m) })),
      read: int(rp.readPerWrite),
      readCaption: 'tokens read for every token Claude wrote',
      paid: paid ? { amount: usd0(paid.paid), caption: paid.caption } : null,
      drift: driftPct != null ? { pct: `${driftPct}%`, caption: `of my last week on what I said I'd do` } : null,
      fine: "Same tokens, each model's list price, cache included. Compares prices, not outcomes.",
      cmd: SHARE_CMD,
    },
    dailyCum: { dates: rp.dailyCum.dates },
    // What the page script needs to swap the estimate for a typed amount; the wording stays in vs-text.js.
    ran: rp.actualListCost,
    cmd: SHARE_CMD,
    post: { head: postHead(rp), read: readLine(rp), drift: driftPost(driftPct) },
    words: {
      paidHtml: boldFirst(PAID_ACTUAL_TEXT, '{amt}'),
      multHtml: boldFirst(multipleFacts(1, 1, false, '{x}').text, '{x}'),
      actualCaption: PAID_ACTUAL_CAPTION,
      actualPost: PAID_ACTUAL_POST,
    },
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

  const srcNotes = overrideRows(rp).map(m => `<p>${esc(m.label)}: ${esc(m.note || 'price')} from <a href="${esc(m.sourceUrl)}" rel="noopener" target="_blank">${esc(m.sourceName || m.sourceUrl)}</a>, checked ${esc(dayLabel(m.checked))}${m.after ? `; ${esc(usd0(m.after.total))} at the price after the introductory period` : ''}.${m.assumption ? ' ' + esc(m.assumption) : ''}</p>`);
  const fillNotes = filledNotes(rp).map(n => `<p>${esc(n)}</p>`);

  return `
<!-- YOUR USAGE ON OTHER MODELS (reprice): race, facts, card -->
<style>${CSS}</style>
<section id="vs">
  <div class="vs-head"><h3 class="vs-title">Your usage on other models</h3><span class="vs-range">${esc(periodLabel(rp))}</span></div>
  <p class="vs-lead">Same tokens, every frontier model.</p>
  <p class="vs-sub">${esc(tokensLabel(totalTokens(rp)))} tokens from your Claude Code logs, repriced at each model&rsquo;s list price.</p>

  <div class="vs-clock"><span id="vs-clock-label"><span class="vs-now">Replaying your real days</span><span class="vs-final">Your real days, replayed</span></span><b id="vs-clock"><span class="vs-now">${esc(dateLabels[0] || '')}</span><span class="vs-final">${esc(dateLabels[dateLabels.length - 1] || '')}</span></b></div>
  <ol class="vs-race" id="vs-race" style="--vs-n:${all.length}" aria-label="Your usage repriced on each model">${rowsHtml}
  </ol>

  <div class="vs-facts">
    <p class="vs-fact">${emph(readLine(rp))}</p>
    <p class="vs-fact">${emph(cacheLine(rp))}</p>
    <p class="vs-fact" id="vs-paid-line"${paid ? '' : ' hidden'}>${paid ? boldFirst(paid.text, usd0(paid.paid)) : ''}</p>
    <p class="vs-fact" id="vs-mult-line"${mult ? '' : ' hidden'}>${mult ? boldFirst(multipleFacts(rp.actualListCost, paid.paid, true, '{x}').text, '{x}').replace('{x}', timesLabel(mult.times)) : ''}</p>
    <div class="vs-paid">
      <label class="vs-plabel" for="vs-paid-in">What you actually paid</label>
      <div class="vs-pbox"><span class="vs-cur" aria-hidden="true">$</span><input class="vs-pin" id="vs-paid-in" type="number" inputmode="decimal" min="0" step="any" placeholder="0" autocomplete="off" aria-describedby="vs-paid-help"></div>
      <p class="vs-phelp" id="vs-paid-help">In US dollars, all months together. Optional. It stays on this page: nothing is stored or sent.</p>
    </div>
    ${driftLine ? `<p class="vs-fact vs-drift">${emph(driftLine)}</p>` : ''}
  </div>

  <div class="vs-actions">
    <button class="vs-btn vs-primary" id="vs-dl" type="button">Download card</button>
    <button class="vs-btn" id="vs-cp" type="button">Copy text</button>
    <a class="vs-btn" id="vs-px" href="https://x.com/intent/post?text=${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Post on X</a>
    <button class="vs-btn" id="vs-replay" type="button">Replay</button>
  </div>
  <div class="vs-toast" id="vs-toast" role="status" aria-live="polite"></div>

  <div class="vs-fine">
    <p class="vs-first">${esc(FINE_PRINT)}</p>
    ${paid ? `<p>${esc(PAID_FINE_PRINT)}</p>` : ''}
    <p>${esc(pricesLine(rp))}</p>
    ${srcNotes.join('')}
    ${fillNotes.join('')}
    <p>&ldquo;What you ran&rdquo; is the same logs at the Claude list prices for the models you actually used. This ran on your machine; nothing was uploaded.</p>
  </div>
</section>
<script type="application/json" id="vs-data">${json}</script>
<noscript><style>${FINAL_RULES}</style></noscript>
<script id="vs-js">${SCRIPT}</script>
`;
}
