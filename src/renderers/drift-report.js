import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')).version;

function esc(s) {
  if (s === 0) return '0';
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const MIN = 60000;
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const hours = (ms) => {
  const h = ms / 3600000;
  if (h >= 10) return `${Math.round(h)}h`;
  if (h >= 1) return `${h.toFixed(1).replace(/\.0$/, '')}h`;
  return `${Math.max(1, Math.round(ms / MIN))}m`;
};
const dateShort = (iso) => { const d = new Date(iso + 'T00:00:00'); return `${MONTH[d.getMonth()]} ${d.getDate()}`; };
const weekday = (iso) => WEEKDAY[new Date(iso + 'T00:00:00').getDay()];
// "Sep 22–29" when one month, "Sep 28 – Oct 4" across two
function rangeLabel(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return da.getMonth() === db.getMonth() ? `${MONTH[da.getMonth()]} ${da.getDate()}–${db.getDate()}` : `${dateShort(a)} – ${dateShort(b)}`;
}

// A closing line with a bit of bite, in his register: lowercase, no wind-up, takes the reader's side against the
// drift. Built from how the week actually went (the worst day, the kind of detour), never a stock quip.
function kicker(share, drift) {
  const pct = Math.round(share * 100);
  const off = 100 - pct;
  const worst = drift.worstDay && drift.worstDay.detourMs > 0 ? weekday(drift.worstDay.day).toLowerCase() : null;
  const cat = drift.detours[0]?.category;
  const chase = cat && cat !== 'something else' ? cat : 'a tangent';
  if (pct >= 85) return `${pct}% on plan. who are you and what did you do with the tabs.`;
  if (pct >= 60) return worst ? `${pct}% on plan. then ${worst} showed up and you chased ${chase} till 1am.` : `${pct}% on plan. the other ${off}% was 1am you, freelancing.`;
  if (pct >= 40) return worst ? `half the plan, half whatever ${worst} was. ${chase}, mostly.` : `half the plan, half opinions. the plan didn't win the tie.`;
  if (pct >= 20) return `${pct}% on plan. the plan was more of a vibe this week.`;
  return `${pct}%. the plan filed a missing person report.`;
}

/**
 * The drift card: phone-first, built to screenshot. Fully offline, no web fonts, no network.
 * `drift` is the analysis from analyzeDrift; `opts.redact` shows detour categories instead of the user's words.
 */
export function renderDrift(drift, { redact = false } = {}) {
  const pct = Math.round((drift.share || 0) * 100);
  const { onMs, detourMs } = drift.totals;
  const range = rangeLabel(firstDay(drift), lastDay(drift));

  // Names by default; with --redact, categories, merged so one kind of detour is one row
  const detours = (redact ? mergeByCategory(drift.detours) : drift.detours)
    .slice(0, 5)
    .map(d => ({ label: redact ? d.category : (d.name || d.category), ms: d.ms, times: d.times }));
  const worst = drift.worstDay && drift.worstDay.detourMs > 0 ? drift.worstDay : null;
  const streak = drift.streak && drift.streak.ms >= 20 * MIN ? drift.streak : null;

  const agents = [drift.inputs?.claude && 'Claude Code', drift.inputs?.codex && 'Codex'].filter(Boolean).join(' + ') || 'Claude Code';
  const sourceLine = sourceNote(drift);

  const detourRows = detours.map((d, i) => `
      <li class="row" style="--i:${i}">
        <span class="dot"></span>
        <span class="rlabel">${esc(d.label)}${d.times > 1 ? `<span class="rtimes">&times;${d.times}</span>` : ''}</span>
        <span class="rtime">${hours(d.ms)}</span>
      </li>`).join('');

  const CARD = `
  <article class="card" id="card" role="img" aria-label="Drift report: ${pct}% of agent time on plan">
    <header class="top">
      <span class="brand">DRIFT REPORT</span>
      <span class="range">${esc(agents)}<br>${esc(range)}</span>
    </header>

    <section class="hero">
      <div class="big"><span class="num" id="num" data-to="${pct}">${pct}</span><span class="pctsign">%</span></div>
      <p class="cap">of your agent time went to<br><strong>what you said you&rsquo;d do</strong></p>
    </section>

    <div class="split" aria-hidden="true">
      <div class="bar"><span class="fill" id="fill" style="width:${pct}%"></span></div>
      <div class="legend">
        <span><i class="sw on"></i> On plan &middot; ${hours(onMs)}</span>
        <span><i class="sw off"></i> Detours &middot; ${hours(detourMs)}</span>
      </div>
    </div>

    ${detours.length ? `
    <section class="block">
      <h2>Where the rest went</h2>
      <ul class="rows">${detourRows}</ul>
    </section>` : ''}

    <section class="facts">
      ${worst ? `<div class="fact"><span class="fk">Drifted most</span><span class="fv">${esc(weekday(worst.day))}</span><span class="fs">${Math.round(worst.share * 100)}% off plan</span></div>` : ''}
      ${streak ? `<div class="fact"><span class="fk">Longest rabbit hole</span><span class="fv">${hours(streak.ms)}</span><span class="fs">${redact ? esc(streak.category) : esc(streak.name || streak.category)}</span></div>` : ''}
    </section>

    <p class="kick">${esc(kicker(drift.share || 0, drift))}</p>

    <footer class="foot">
      <span class="mover">Mover OS catches the drift while it happens.</span>
      <span class="cmd">npx cchubber --drift</span>
    </footer>
  </article>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Drift Report &middot; CC Hubber</title>
<meta name="description" content="How much of your Claude Code week went to what you said you'd do. Runs locally, nothing leaves your machine.">
<style>
  :root{
    --bg:#0e0f13; --card:#15161c; --card2:#191b22; --ink:#ecebf1; --dim:#9a99a8; --faint:#6a6a78;
    --line:rgba(255,255,255,.07); --on:#7fe0b0; --off:#ffb27a; --accent:#c0c1ff;
    --shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 24px 60px -20px rgba(0,0,0,.7);
  }
  *{box-sizing:border-box}
  html,body{margin:0}
  body{
    background:var(--bg); color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
    padding:0; min-height:100dvh;
  }
  .page{max-width:390px; margin:0 auto; padding:18px 0 26px}
  .mono{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}
  .card{
    margin:0 14px; background:
      radial-gradient(120% 80% at 50% -10%, rgba(192,193,255,.10), transparent 60%),
      linear-gradient(180deg,var(--card),var(--card2));
    border:1px solid var(--line); border-radius:26px; padding:26px 22px 18px;
    box-shadow:var(--shadow); position:relative; overflow:hidden;
  }
  .card::after{ /* faint grain, fixed layer, never animated */
    content:""; position:absolute; inset:0; pointer-events:none; opacity:.03; mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  .top{display:flex; justify-content:space-between; align-items:baseline; gap:10px}
  .brand{font-size:11px; font-weight:800; letter-spacing:.22em; color:var(--accent)}
  .range{font-size:11px; color:var(--faint); text-align:right; letter-spacing:.02em}
  .range,.cmd,.num,.rtime,.fv{font-family:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace}

  .hero{padding:22px 0 4px; text-align:center}
  .big{display:flex; align-items:flex-start; justify-content:center; line-height:.9}
  .num{font-size:112px; font-weight:800; letter-spacing:-.04em;
    background:linear-gradient(180deg,#fff,#c9c8e6); -webkit-background-clip:text; background-clip:text; color:transparent;
    font-variant-numeric:tabular-nums}
  .pctsign{font-size:40px; font-weight:800; color:var(--accent); margin-top:14px; margin-left:2px}
  .cap{margin:6px 0 0; font-size:16px; color:var(--dim); line-height:1.35}
  .cap strong{color:var(--ink); font-weight:700}

  .split{margin:20px 2px 6px}
  .bar{height:12px; border-radius:8px; background:rgba(255,178,122,.22); overflow:hidden}
  .fill{display:block; height:100%; border-radius:8px 0 0 8px;
    background:linear-gradient(90deg,#7fe0b0,#9be8c2); box-shadow:0 0 16px rgba(127,224,176,.35);
    transform-origin:left center}
  .legend{display:flex; justify-content:space-between; margin-top:9px; font-size:12px; color:var(--dim)}
  .legend i{display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:5px; vertical-align:middle}
  .sw.on{background:#7fe0b0} .sw.off{background:#ffb27a}

  .block{margin-top:22px}
  h2{margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--faint)}
  .rows{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
  .row{display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--line)}
  .row:last-child{border-bottom:0}
  .dot{width:6px; height:6px; border-radius:50%; background:var(--off); flex:none; box-shadow:0 0 8px rgba(255,178,122,.5)}
  .rlabel{flex:1; font-size:14px; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
  .rtimes{color:var(--faint); font-size:11px; margin-left:6px}
  .rtime{font-size:13px; color:var(--dim); flex:none; font-variant-numeric:tabular-nums}

  .facts{display:flex; gap:10px; margin-top:20px}
  .fact{flex:1; background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:14px; padding:12px 13px; min-width:0}
  .fk{display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint)}
  .fv{display:block; font-size:20px; font-weight:800; margin:3px 0 1px}
  .fs{display:block; font-size:12px; color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

  .kick{margin:22px 2px 0; font-size:15px; line-height:1.4; color:#e7d9c2}

  .foot{display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:20px; padding-top:14px; border-top:1px solid var(--line)}
  .mover{font-size:11px; color:var(--faint); max-width:56%; line-height:1.3}
  .cmd{font-size:12px; color:var(--accent); background:rgba(192,193,255,.08); border:1px solid rgba(192,193,255,.16); padding:5px 9px; border-radius:8px; white-space:nowrap}

  .note{margin:16px 16px 0; font-size:11px; line-height:1.5; color:var(--faint); text-align:center}
  .note b{color:var(--dim); font-weight:600}

  /* Motion carries the reveal: the number counts up, the bar fills, the detours slide in. All off under reduced-motion. */
  @media (prefers-reduced-motion: no-preference){
    .anim .fill{animation:grow .9s cubic-bezier(.22,1,.32,1) .15s both}
    .anim .row{opacity:0; animation:slide .5s cubic-bezier(.22,1,.32,1) both; animation-delay:calc(.5s + var(--i)*.09s)}
    .anim .hero .cap,.anim .kick,.anim .facts,.anim .foot{opacity:0; animation:rise .6s ease .25s both}
    .anim .kick{animation-delay:.9s} .anim .facts{animation-delay:.7s} .anim .foot{animation-delay:1.1s}
    @keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
    @keyframes slide{from{opacity:0; transform:translateX(10px)}to{opacity:1; transform:none}}
    @keyframes rise{from{opacity:0; transform:translateY(8px)}to{opacity:1; transform:none}}
  }
</style></head>
<body>
  <div class="page">
  ${CARD}
  <p class="note">${esc(sourceLine)} <b>Everything ran on this machine. Nothing was uploaded.</b> The method is rough: it reads your words and the files touched, so it will miscall the odd one.</p>
  </div>
<script>
  (function(){
    var el=document.getElementById('num'); if(!el) return;
    var to=+el.getAttribute('data-to')||0;
    var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // #shot renders the finished card in one frame, for a clean screenshot; otherwise motion plays once
    var shot=/shot/.test(location.hash);
    if(!reduce&&!shot) document.body.classList.add('anim');
    if(reduce||shot||to<=0){el.textContent=to; return;}
    var start=null, dur=1100;
    function tick(ts){
      if(start===null) start=ts;
      var p=Math.min(1,(ts-start)/dur);
      var e=1-Math.pow(1-p,3);
      el.textContent=Math.round(e*to);
      if(p<1) requestAnimationFrame(tick); else el.textContent=to;
    }
    el.textContent='0';
    requestAnimationFrame(tick);
  })();
</script>
</body></html>`;
}

// For --redact: one row per category, times and minutes summed, biggest first
function mergeByCategory(detours) {
  const by = new Map();
  for (const d of detours) {
    const c = by.get(d.category) || { category: d.category, ms: 0, times: 0 };
    c.ms += d.ms; c.times += d.times;
    by.set(d.category, c);
  }
  return [...by.values()].sort((a, b) => b.ms - a.ms);
}

function firstDay(drift) { return drift.days?.[0]?.day || new Date(drift.since).toISOString().slice(0, 10); }
function lastDay(drift) { const d = drift.days; return (d && d[d.length - 1]?.day) || new Date(drift.until).toISOString().slice(0, 10); }

// Plain text; the template escapes it. Says which sources set "what you said you'd do".
function sourceNote(drift) {
  const s = drift.source || {};
  const names = s.planNames || [];
  if (names.length) {
    const where = names.join(' and ');
    const scope = s.scope === 'project' ? ', so on-plan means on the project' : '';
    return `Measured against ${where}${scope}, then your first ask of each session where there was no plan.`;
  }
  return 'Measured against the first thing you asked in each session.';
}
