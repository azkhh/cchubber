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
// "Sep 22 to 29" when one month, "Sep 28 to Oct 4" across two
function rangeLabel(a, b) {
  const da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return da.getMonth() === db.getMonth() ? `${MONTH[da.getMonth()]} ${da.getDate()} to ${db.getDate()}` : `${dateShort(a)} to ${dateShort(b)}`;
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

// ---------------------------------------------------------------------------------------------------------------
// The drift card as a component: one section inside the plain report, under the "Did you spend them well?" strip.
// Every selector starts with #drift and nothing is fetched, so it cannot restyle the report around it. The card itself
// (number, bar, detours, facts, closing line) is the same markup the standalone --drift page used to have.
// ---------------------------------------------------------------------------------------------------------------
const CSS = `
#drift{
  --card:#15161c; --card2:#191b22; --ink:#ecebf1; --dim:#9a99a8; --faint:#6a6a78;
  --line:rgba(255,255,255,.07); --on:#7fe0b0; --off:#ffb27a; --accent:#c0c1ff;
  --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  width:100%; max-width:1152px; margin-left:auto; margin-right:auto; color:var(--ink);
}
#drift .dr-head{display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; margin:0 0 16px}
#drift .dr-title{margin:0; font-size:20px; line-height:1.2; font-weight:700; color:var(--ink)}
#drift .dr-range{font-family:var(--mono); font-size:11px; color:var(--faint)}
#drift .dr-grid{display:grid; grid-template-columns:minmax(0,390px) minmax(0,1fr); gap:28px; align-items:start}
#drift .dr-grid > *{min-width:0}
#drift .dr-side{display:flex; flex-direction:column; gap:22px; padding-top:6px}
#drift .dr-side h4{margin:0 0 8px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--faint)}
#drift .dr-side p{margin:0; font-size:16px; line-height:1.5; color:var(--dim)}
#drift .dr-side p b{color:var(--ink); font-weight:700}
#drift .dr-side .dr-small{font-size:13px; line-height:1.6; color:var(--faint)}
#drift .dr-empty{background:var(--card); border:1px solid rgba(70,69,84,.15); border-radius:12px; padding:24px 28px; max-width:760px}
#drift .dr-empty p{margin:0 0 12px; font-size:16px; line-height:1.55; color:var(--dim)}
#drift .dr-empty p:last-child{margin-bottom:0}
#drift .dr-empty p b{color:var(--ink)}
#drift .dr-code{display:inline-block; font-family:var(--mono); font-size:13px; color:var(--accent); background:rgba(192,193,255,.08); border:1px solid rgba(192,193,255,.16); padding:3px 8px; border-radius:6px}

#drift .card{
  margin:0; background:
    radial-gradient(120% 80% at 50% -10%, rgba(192,193,255,.10), transparent 60%),
    linear-gradient(180deg,var(--card),var(--card2));
  border:1px solid var(--line); border-radius:26px; padding:26px 22px 18px;
  box-shadow:0 1px 0 rgba(255,255,255,.04) inset, 0 24px 60px -20px rgba(0,0,0,.7); position:relative; overflow:hidden;
}
#drift .top{display:flex; justify-content:space-between; align-items:baseline; gap:10px}
#drift .brand{font-size:11px; font-weight:800; letter-spacing:.22em; color:var(--accent)}
#drift .range{font-size:11px; color:var(--faint); text-align:right; letter-spacing:.02em}
#drift .range,#drift .cmd,#drift .num,#drift .rtime,#drift .fv{font-family:var(--mono)}
#drift .hero{padding:22px 0 4px; text-align:center}
#drift .big{display:flex; align-items:flex-start; justify-content:center; line-height:.9}
#drift .num{font-size:112px; font-weight:800; letter-spacing:-.04em;
  background:linear-gradient(180deg,#fff,#c9c8e6); -webkit-background-clip:text; background-clip:text; color:transparent; font-variant-numeric:tabular-nums}
#drift .pctsign{font-size:40px; font-weight:800; color:var(--accent); margin-top:14px; margin-left:2px}
#drift .cap{margin:6px 0 0; font-size:16px; color:var(--dim); line-height:1.35}
#drift .cap strong{color:var(--ink); font-weight:700}
#drift .split{margin:20px 2px 6px}
#drift .bar{height:12px; border-radius:8px; background:rgba(255,178,122,.22); overflow:hidden}
#drift .fill{display:block; height:100%; border-radius:8px 0 0 8px; background:linear-gradient(90deg,#7fe0b0,#9be8c2); box-shadow:0 0 16px rgba(127,224,176,.35)}
#drift .legend{display:flex; justify-content:space-between; margin-top:9px; font-size:12px; color:var(--dim)}
#drift .legend i{display:inline-block; width:9px; height:9px; border-radius:3px; margin-right:5px; vertical-align:middle}
#drift .sw.on{background:#7fe0b0} #drift .sw.off{background:#ffb27a}
#drift .block{margin-top:22px}
#drift .block h2{margin:0 0 10px; font-size:11px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:var(--faint)}
#drift .rows{list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:2px}
#drift .row{display:flex; align-items:center; gap:10px; padding:9px 4px; border-bottom:1px solid var(--line)}
#drift .row:last-child{border-bottom:0}
#drift .dot{width:6px; height:6px; border-radius:50%; background:var(--off); flex:none; box-shadow:0 0 8px rgba(255,178,122,.5)}
#drift .rlabel{flex:1; min-width:0; font-size:14px; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
#drift .rtimes{color:var(--faint); font-size:11px; margin-left:6px}
#drift .rtime{font-size:13px; color:var(--dim); flex:none; font-variant-numeric:tabular-nums}
#drift .facts{display:flex; gap:10px; margin-top:20px}
#drift .fact{flex:1; background:rgba(255,255,255,.03); border:1px solid var(--line); border-radius:14px; padding:12px 13px; min-width:0}
#drift .fk{display:block; font-size:10px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint)}
#drift .fv{display:block; font-size:20px; font-weight:800; margin:3px 0 1px}
#drift .fs{display:block; min-width:0; font-size:12px; color:var(--dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
#drift .kick{margin:22px 2px 0; font-size:15px; line-height:1.4; color:#e7d9c2}
#drift .foot{display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:20px; padding-top:14px; border-top:1px solid var(--line)}
#drift .mover{font-size:11px; color:var(--faint); max-width:56%; line-height:1.3}
#drift .cmd{font-size:12px; color:var(--accent); background:rgba(192,193,255,.08); border:1px solid rgba(192,193,255,.16); padding:5px 9px; border-radius:8px; white-space:nowrap}

@media (max-width:900px){
  #drift .dr-grid{grid-template-columns:minmax(0,1fr)}
  #drift .card{width:100%; max-width:420px; margin:0 auto}
  #drift .dr-side{padding-top:0}
}
@media (max-width:420px){
  #drift .num{font-size:96px}
  #drift .dr-empty{padding:18px 16px}
}
`;

function cardHtml(drift, { redact }) {
  const pct = Math.round((drift.share || 0) * 100);
  const { onMs, detourMs } = drift.totals;
  const range = rangeLabel(firstDay(drift), lastDay(drift));

  // Names by default (scrubbed by drift-privacy); with --redact, categories, merged so one kind of detour is one row
  const detours = (redact ? mergeByCategory(drift.detours) : drift.detours)
    .slice(0, 5)
    .map(d => ({ label: redact ? d.category : (d.name || d.category), ms: d.ms, times: d.times }));
  const worst = drift.worstDay && drift.worstDay.detourMs > 0 ? drift.worstDay : null;
  const streak = drift.streak && drift.streak.ms >= 20 * MIN ? drift.streak : null;
  const agents = [drift.inputs?.claude && 'Claude Code', drift.inputs?.codex && 'Codex'].filter(Boolean).join(' + ') || 'Claude Code';

  const detourRows = detours.map((d, i) => `
      <li class="row" style="--i:${i}">
        <span class="dot"></span>
        <span class="rlabel">${esc(d.label)}${d.times > 1 ? `<span class="rtimes">&times;${d.times}</span>` : ''}</span>
        <span class="rtime">${hours(d.ms)}</span>
      </li>`).join('');

  return `
  <article class="card" id="card" role="img" aria-label="Drift report: ${pct}% of agent time on plan">
    <header class="top">
      <span class="brand">DRIFT REPORT</span>
      <span class="range">${esc(agents)}<br>${esc(range)}</span>
    </header>

    <section class="hero">
      <div class="big"><span class="num" id="num">${pct}</span><span class="pctsign">%</span></div>
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
      <span class="cmd">npx cchubber</span>
    </footer>
  </article>`;
}

// What to add so it works next run, in plain words. Never a number.
const EMPTY = {
  'no-plan': (d) => `
    <p><b>No written plan found, so there is nothing to measure your last ${d} days against.</b></p>
    <p>Write what you mean to do as a checklist in a <span class="dr-code">PLAN.md</span>, <span class="dr-code">plan.md</span> or <span class="dr-code">TODO.md</span> in the project you work in, for example <span class="dr-code">- [ ] ship the login page</span>. Run cchubber again and your week will be checked against it.</p>
    <p>If you use Mover OS, the Focus and Tasks in your Daily Note count too.</p>`,
  'no-work': (d) => `
    <p><b>No Claude Code or Codex work in the last ${d} days, so there is nothing to measure.</b></p>
    <p>Use it this week, with a checklist in a <span class="dr-code">PLAN.md</span> or <span class="dr-code">TODO.md</span> in the project, and run cchubber again.</p>`,
  'error': (d) => `
    <p><b>Drift could not be read on this machine this time, so no number is shown.</b></p>
    <p>Run cchubber again. Your last ${d} days are read from your own Claude Code folder and nothing is uploaded.</p>`,
};

/**
 * The drift section of the plain report. `state` comes from driftForReport: { state, days, drift }.
 * `opts.redact` shows detour categories instead of the user's words (the old --drift --redact).
 * Returns style + markup for one section (id="drift"), offline, nothing fetched.
 */
export function renderDriftSection(state, { redact = false } = {}) {
  if (!state) return '';
  const days = state.days || 7;
  const ok = state.state === 'ok' && state.drift;
  const range = ok ? rangeLabel(firstDay(state.drift), lastDay(state.drift)) : `last ${days} days`;

  let body;
  if (ok) {
    const d = state.drift;
    const t = d.totals;
    const agents = [d.inputs?.claude && `${d.inputs.claude} Claude Code`, d.inputs?.codex && `${d.inputs.codex} Codex`].filter(Boolean).join(', ') || 'Claude Code';
    body = `
  <div class="dr-grid">
    ${cardHtml(d, { redact })}
    <div class="dr-side">
      <div>
        <h4>What you said you&rsquo;d do</h4>
        <p>${esc(sourceNote(d))}</p>
      </div>
      <div>
        <h4>What was measured</h4>
        <p><b>${esc(t.prompts)}</b> prompts across <b>${esc(t.sessions)}</b> sessions (${esc(agents)}) in the last ${days} days. Work that matched your plan counts as on plan; everything else is a detour.</p>
      </div>
      <p class="dr-small">Everything ran on this machine. Nothing was uploaded. The method is rough: it reads your words and the files touched, so it will miscall the odd one.${redact ? '' : ' Detour names are your own words with paths, keys and links removed; run with --redact to show categories only.'}</p>
    </div>
  </div>`;
  } else {
    body = `<div class="dr-empty">${(EMPTY[state.state] || EMPTY.error)(days)}</div>`;
  }

  return `
<!-- DRIFT: your last week against what you said you'd do -->
<style>${CSS}</style>
<section id="drift" aria-label="Your week against your plan">
  <div class="dr-head"><h3 class="dr-title">Your week against your plan</h3><span class="dr-range">${esc(range)}</span></div>
  ${body}
</section>
<script id="dr-js">(function(){ if (location.hash === '#drift') window.addEventListener('load', function(){ setTimeout(function(){ var s = document.getElementById('drift'); if (s) s.scrollIntoView(); }, 60); }); })();</script>
`;
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
