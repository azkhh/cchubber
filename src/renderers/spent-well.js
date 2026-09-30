import { tokensLabel, int } from './vs-text.js';

// "Did you spend them well?": a strip under the grade card, and an in-page panel that hands the user a prompt for their
// own Claude Code. Everything is local except one optional anonymous count per button (see the script), which is only
// wired in when telemetry was on at the time the report was made.

export const PROMPT = `Be brutally honest with me. I want the truth, not encouragement.

1. Find what I said I wanted: read CLAUDE.md, the README, any plan, roadmap, TODO or notes file, and my recent commit messages and branch names. If my goals aren't written down anywhere, say that first. That is a finding.
2. Find what I actually did: the git log for the last 30 days, what shipped, what is half finished, what I started and dropped, and what I rewrote more than once.
3. Compare the two. Where did the time and tokens really go? Which work moved the goal, and which was avoidance that felt like progress (polishing, refactoring, tooling, research, switching projects)?
4. Give me a one-line verdict first, then the evidence with file names and commits. No softening and no compliment sandwich.
5. Tell me the one thing I should do next and the one thing I should stop doing.
6. Last, answer honestly: would a system that keeps my goals, plan and decisions in front of you every session, and pushes back when I drift, have closed this gap? That is what Mover OS does (moveros.dev). If it would not have helped, say so.`;

export const MOVER_URL = 'https://moveros.dev/?utm_source=cchubber&utm_medium=report&utm_campaign=spent_well';
export const INTRO = "Paste this into Claude Code in the project you've been working on. It compares what you set out to do with what you actually did. It won't be nice.";
export const FIX_LINE = "The fix: Mover OS keeps what you said you'd do in front of Claude every session and calls it out when you drift.";
export const EVENTS = ['spent_well_open', 'spent_well_copy', 'spent_well_mover'];

export const FINE_ON = 'Clicking these buttons sends one anonymous count each (which button, this version, your anonymous install ID). Nothing from your usage. Turn it off with --no-telemetry.';
export const FINE_OFF = 'Telemetry is off, so clicking these buttons sends nothing.';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 25.3B, 740M, 12,300: the short form for the terminal. */
export function tokensShort(n) {
  const trim = (x) => x.toFixed(1).replace(/\.0$/, '');
  return n >= 1e9 ? `${trim(n / 1e9)}B` : n >= 1e6 ? `${trim(n / 1e6)}M` : int(n);
}

/** Every token the logs hold, read from the same totals the repricing uses. */
export function totalTokensOf(report) {
  const t = report?.costAnalysis?.totals || {};
  return (t.inputTokens || 0) + (t.outputTokens || 0) + (t.cacheReadTokens || 0) + (t.cacheWriteTokens || 0);
}

export function spentWellLine(report) {
  const n = totalTokensOf(report);
  return n > 0 ? `You burnt ${tokensShort(n)} tokens. Did you spend them well? Find out in your report.` : null;
}

const CSS = `
#sw{
  --sw-surface:#1b1c1d; --sw-deep:#0d0e0f; --sw-ink:#e3e2e3; --sw-dim:#c7c4d7; --sw-faint:#908fa0; --sw-line:rgba(70,69,84,.25);
  --sw-accent:#c0c1ff; --sw-warm:#ffb690; --sw-on:#7fe0b0;
  --sw-sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --sw-mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  width:100%; max-width:740px; margin-left:auto; margin-right:auto; font-family:var(--sw-sans);
}
#sw .sw-strip{display:flex; align-items:center; justify-content:space-between; gap:16px 24px; flex-wrap:wrap; background:var(--sw-surface);
  border:1px solid rgba(70,69,84,.15); border-left:3px solid var(--sw-warm); border-radius:12px; padding:18px 22px}
#sw .sw-line{margin:0; flex:1 1 280px; font-size:clamp(17px,2.4vw,21px); line-height:1.3; font-weight:700; color:var(--sw-dim)}
#sw .sw-line b{color:var(--sw-ink); font-weight:800}
#sw .sw-btn{appearance:none; font:inherit; font-size:14px; font-weight:700; cursor:pointer; text-decoration:none; color:var(--sw-ink); background:rgba(255,255,255,.05);
  border:1px solid rgba(70,69,84,.3); border-radius:8px; padding:10px 18px; min-height:44px; display:inline-flex; align-items:center; justify-content:center}
#sw .sw-btn:hover{background:#292a2b}
#sw .sw-btn.sw-primary{background:var(--sw-accent); color:#1000a9; border-color:transparent}
#sw .sw-btn.sw-primary:hover{background:#d3d4ff}
#sw .sw-btn:focus-visible, #sw .sw-link:focus-visible, #sw .sw-prompt:focus-visible, #sw .sw-head:focus-visible{outline:2px solid var(--sw-accent); outline-offset:2px}
#sw .sw-fine{margin:10px 4px 0; font-size:11px; line-height:1.5; color:var(--sw-faint)}

#sw .sw-panel{margin-top:12px; background:var(--sw-surface); border:1px solid rgba(70,69,84,.15); border-radius:12px; padding:24px}
#sw .sw-panel[hidden]{display:none}
#sw .sw-top{display:flex; justify-content:space-between; align-items:flex-start; gap:12px}
#sw .sw-head{margin:0; font-size:20px; line-height:1.2; font-weight:800; color:var(--sw-ink)}
#sw .sw-intro{margin:12px 0 14px; font-size:15px; line-height:1.5; color:var(--sw-dim)}
#sw .sw-prompt{display:block; width:100%; box-sizing:border-box; resize:vertical; background:var(--sw-deep); color:var(--sw-ink); border:1px solid rgba(144,143,160,.35);
  border-radius:8px; padding:14px; font-family:var(--sw-mono); font-size:13px; line-height:1.55; min-height:160px}
#sw .sw-row{display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-top:12px}
/* read out by screen readers; the button label already shows Copied to everyone else */
#sw .sw-status{position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; border:0}
#sw .sw-fix{margin:22px 0 0; padding-top:18px; border-top:1px solid var(--sw-line); font-size:16px; line-height:1.45; font-weight:600; color:var(--sw-dim)}
#sw .sw-link{display:inline-flex; align-items:center; min-height:44px; margin-top:10px; font-size:14px; font-weight:700; color:var(--sw-accent)}

@media (max-width:640px){
  #sw .sw-strip{padding:16px}
  #sw .sw-strip .sw-btn{flex:1 1 100%}
  #sw .sw-panel{padding:18px 16px}
  #sw .sw-prompt{font-size:12px}
  #sw .sw-row .sw-btn{flex:1 1 100%}
}
`;

// Plain ES5, no template literals and no ${ so it can sit in a String.raw block. It reads #sw-data and touches only #sw.
const SCRIPT = String.raw`
(function(){
  var T = JSON.parse(document.getElementById('sw-data').textContent);   // { on: false } or { on: true, url, uid, v }
  var btn = document.getElementById('sw-open'), panel = document.getElementById('sw-panel'), head = document.getElementById('sw-head');
  var prompt = document.getElementById('sw-prompt'), copyBtn = document.getElementById('sw-copy'), status = document.getElementById('sw-status');
  var closeBtn = document.getElementById('sw-close'), link = document.getElementById('sw-mover');
  var sent = {}, timer = null;

  // One anonymous count per button per page load, and only when telemetry was on when this report was made.
  function beacon(ev){
    if (!T.on || sent[ev]) return;
    sent[ev] = true;
    try { if (navigator.sendBeacon) navigator.sendBeacon(T.url, JSON.stringify({ event: ev, v: T.v, uid: T.uid })); } catch (e) {}
  }
  function fit(){ prompt.style.height = 'auto'; prompt.style.height = (prompt.scrollHeight + 4) + 'px'; }
  function open(){
    panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); fit();
    head.focus(); panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    beacon('spent_well_open');
  }
  function close(){ panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); btn.focus(); }
  btn.addEventListener('click', function(){ if (panel.hidden) open(); else close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function(e){ if ((e.key === 'Escape' || e.key === 'Esc') && !panel.hidden) { e.preventDefault(); close(); } });
  window.addEventListener('resize', function(){ if (!panel.hidden) fit(); });

  function done(ok){
    status.textContent = ok ? 'Copied' : 'Could not copy. Select the text and copy it yourself.';
    copyBtn.textContent = ok ? 'Copied' : 'Copy prompt';
    clearTimeout(timer);
    timer = setTimeout(function(){ status.textContent = ''; copyBtn.textContent = 'Copy prompt'; }, 2600);
  }
  function fallback(){
    prompt.focus(); prompt.select(); prompt.setSelectionRange(0, prompt.value.length);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    done(ok);
  }
  copyBtn.addEventListener('click', function(){
    beacon('spent_well_copy');
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(prompt.value).then(function(){ done(true); }, fallback); } else { fallback(); }
  });
  link.addEventListener('click', function(){ beacon('spent_well_mover'); });
  link.addEventListener('auxclick', function(){ beacon('spent_well_mover'); });
})();
`;

/**
 * The strip and the panel. `telemetry` is what telemetry.js said when the report was made: { on: false } puts no address
 * and no id in the file; { on: true, url, uid, v } lets the three buttons send one count each.
 */
export function renderSpentWell(report, telemetry = { on: false }) {
  const n = totalTokensOf(report);
  if (!(n > 0)) return '';
  const on = !!(telemetry && telemetry.on && telemetry.url);
  const data = on ? { on: true, url: telemetry.url, uid: telemetry.uid, v: telemetry.v } : { on: false };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return `
<!-- DID YOU SPEND THEM WELL: strip under the grade card, panel with the prompt -->
<style>${CSS}</style>
<section id="sw" aria-label="Did you spend your tokens well?">
  <div class="sw-strip">
    <p class="sw-line">You burnt <b>${esc(tokensLabel(n))}</b> tokens. Did you spend them well?</p>
    <button class="sw-btn sw-primary" id="sw-open" type="button" aria-expanded="false" aria-controls="sw-panel">Find out</button>
  </div>
  <p class="sw-fine">${esc(on ? FINE_ON : FINE_OFF)}</p>
  <div class="sw-panel" id="sw-panel" role="region" aria-labelledby="sw-head" hidden>
    <div class="sw-top">
      <h3 class="sw-head" id="sw-head" tabindex="-1">Did you spend them well?</h3>
      <button class="sw-btn" id="sw-close" type="button" aria-label="Close">Close</button>
    </div>
    <p class="sw-intro">${esc(INTRO)}</p>
    <textarea class="sw-prompt" id="sw-prompt" readonly rows="18" spellcheck="false" aria-label="Prompt to paste into Claude Code">${esc(PROMPT)}</textarea>
    <div class="sw-row">
      <button class="sw-btn sw-primary" id="sw-copy" type="button">Copy prompt</button>
      <span class="sw-status" id="sw-status" role="status" aria-live="polite"></span>
    </div>
    <p class="sw-fix">${esc(FIX_LINE)}</p>
    <a class="sw-link" id="sw-mover" href="${esc(MOVER_URL)}" target="_blank" rel="noopener">See Mover OS</a>
  </div>
</section>
<script type="application/json" id="sw-data">${json}</script>
<script id="sw-js">${SCRIPT}</script>
`;
}
