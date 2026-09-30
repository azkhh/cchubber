import { shortName, categorize, labelName } from './drift-privacy.js';
import { homedir } from 'os';

/**
 * Drift: how much of your agent time went to what you said you'd do.
 *
 * The method, in the order it runs. The report prints the same steps in plain words.
 * 1. Turns. Each message you typed starts a turn; the agent's steps until your next message belong to it.
 *    Agent time is the time between the agent's own steps, and one wait longer than 20 minutes counts as 20.
 * 2. Sittings. Coming back to a session after 2+ quiet hours with a new ask starts a new sitting ("continue" doesn't).
 * 3. What you said. The written plan for that day or folder if there is one, otherwise your first real ask of the
 *    sitting. A /goal command replaces it for the rest of the sitting.
 * 4. Threads. An ask that shares few words with the last few turns (your words, the agent's replies, the files it
 *    touched) starts a new thread. Short replies ("yes", "do it") stay on the thread they answer.
 * 5. Labels. A thread whose opening ask shares enough words or files with what you said is on it. Anything else is
 *    a detour. Rare words count for more than common ones (weighted by how often they appear in your own week).
 * No model is called. Everything here is word and file overlap, so it is rough, and the report says so.
 */

const MIN = 60000;
const HOUR = 60 * MIN;

export const DRIFT = {
  idleCapMs: 20 * MIN,     // one step longer than this (a stuck prompt, a sleeping laptop) counts as this long
  sittingGapMs: 2 * HOUR,  // quiet this long, then a new ask, is a new sitting with its own "what you said"
  continueAt: 0.34,        // share of a new ask's word weight already in the last few turns that keeps it on the thread
  onAt: 0.4,               // share of a new ask's weight that one plan item (or the running focus) must cover for "on"
  warmupMs: 15 * MIN,      // people front-load a task's context in the first minutes; only then is an ask "still setup"
  substantiveAt: 3,        // total word weight an ask needs to be able to change the subject
  replyTerms: 30,          // the agent's rarest words per turn that join the thread's context
  clusterAt: 0.5,          // two detours sharing this much are the same detour, come back to
};

// Words that never say what a request is about: function words, chat filler, and verbs every request uses
const STOP = new Set(`a about above after again against all almost along already also although always am among an and
another any anybody anyone anything anyway anywhere are aren around as at away back be became because become been before
being below beside besides between beyond both but by came can cannot cant could couldnt did didnt do does doesnt doing
done dont down during each either else enough etc even ever every everybody everyone everything everywhere few for from
further get gets getting give given gives go goes going gone got gotten had hadnt has hasnt have havent having he her
here hers herself him himself his how however i if im in inside instead into is isnt it its itself ive just keep kept
last least less let lets like likely made make makes making many may maybe me might mine more most much must my myself
need needed needs neither never next no nobody none nor not nothing now of off often on once one only onto or other
others otherwise our ours ourselves out over own per perhaps please put quite rather really said same say says see seem
seems seen several shall she should shouldnt since so some somebody someone something sometimes somewhere soon still such
sure take taken takes taking tell than that thats the their theirs them themselves then there theres these they theyre
thing things think this those though through thus till to together too took toward towards try trying under unless
until up upon us use used uses using very via want wanted wants was wasnt way ways we well went were werent what whats
whatever when whenever where whereas wherever whether which while who whoever whole whom whose why will with within
without wont would wouldnt yet you youd youll your youre yours yourself yourselves youve
yo yh yeah yea yep yes ya nah nope ok okay alr alright bro bruh broski brudda bruv mate man gng innit lol lmao haha tbh
ngl icl idk yk ik lowk lowkey rn btw pls plz thx thanks thank cheers hey hi hello cool nice great good bad fine damn
wow oh uh um hmm huh actually basically genuinely literally honestly kinda kind sort sorta gonna wanna gotta ain aint
dunno cuz cause coz tho though anyways anyway also again already yall ye yup ofc imo imho fr frfr deadass bet
ask asked asking check checked checking continue continued create created doing find found fix fixed help know knew look
looked looking run running see show showed start started stop tell told thought work worked working works mean meant
means let give gave go went come came call called read wrote write writing added add update updated change changed
try tried seems seemed feel felt happen happened happening sure right wrong new old big small little lot lots bit
able best better way ways kind things stuff something anything everything nothing today tomorrow yesterday now later
time times day days week weeks first second third next last one two three four five also still even
claude codex agent ai model assistant chat session code file files folder message messages prompt reply answer`.split(/\s+/).filter(Boolean));

// Path parts that name the plumbing rather than the work
const PATH_STOP = new Set(`users user home documents desktop downloads library private tmp var opt src lib dist build
node modules index main app test tests spec html css js mjs cjs ts tsx jsx json md mdx txt yaml yml toml png jpg jpeg
svg gif webp pdf py sh log logs dev obsidian projects project readme claude codex`.split(/\s+/));

// Two-letter words worth keeping
const SHORT = new Set(['ui', 'ux', 'db', 'qa', 'ci', 'pr', 'js', 'ts', 'go', 'ml', 'os', 'uk', 'us', 'tv', 'pc', 'vr', 'ar']);

export function stem(w) {
  if (w.length <= 3) return w;
  let s = w;
  if (s.endsWith('ies') && s.length > 4) s = s.slice(0, -3) + 'y';
  else if (s.endsWith('sses')) s = s.slice(0, -2);
  else if (s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  if (/([b-df-hj-np-tv-z])\1$/.test(s) && !/(ll|ss|zz|ff)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  return s;
}

// Content words of a text, stemmed. Links keep only their site name.
export function tokenize(text, stop = STOP) {
  const out = [];
  const s = String(text || '').toLowerCase()
    .replace(/https?:\/\/(?:www\.)?([a-z0-9-]+)[^\s]*/g, ' $1 ')
    .replace(/['’]/g, '');
  for (const raw of s.split(/[^a-z0-9]+/)) {
    if (!raw || (raw.length < 3 && !SHORT.has(raw))) continue;
    if (/^\d+$/.test(raw) || raw.length > 24) continue;
    if (/\d/.test(raw) && raw.length >= 8) continue; // ids and hashes
    if (stop.has(raw)) continue;
    const st = stem(raw);
    if (st.length < 2 || stop.has(st)) continue;
    out.push(st);
  }
  return out;
}

function pathTerms(file, cwd) {
  let p = String(file);
  if (cwd && p.startsWith(cwd)) p = p.slice(cwd.length);
  else p = p.split(/[\\/]/).slice(-3).join('/');
  return tokenize(p.replace(/([a-z])([A-Z])/g, '$1 $2'), new Set([...STOP, ...PATH_STOP]));
}

const CONTINUE = /\b(continue|carry on|keep going|keep at it|go on|go ahead|proceed|resume|where you left off|as you were|do it|go for it|do so|do that|finish (it|up|off))\b/i;
// A command or prefix that states the plan outright
const PLAN_COMMANDS = new Set(['/goal', '/ignite', '/plan', '/focus']);
const PLAN_PREFIX = /^\s*(goal|plan|focus|today'?s? (plan|goal|focus))\s*:/i;

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Share of the weight of `terms` found in `bag` (at weight `min` or more): how much of an ask is already there
export function coverage(terms, bag, idf, min = 0.2) {
  let all = 0, hit = 0;
  for (const w of new Set(terms)) {
    const x = idf(w);
    all += x;
    if ((bag.get(w) || 0) >= min) hit += x;
  }
  return all ? hit / all : 0;
}

// The best a single plan item covers this ask. Scoring against one item at a time, not one merged bag of every
// item, is what stops a sprawling plan from marking everything on-plan: an ask is on the plan only when one thing
// you wrote is really about it, not when its words happen to be scattered across fifty unrelated tasks.
export function bestItemCoverage(terms, itemSets, idf) {
  const uniq = [...new Set(terms)];
  const total = uniq.reduce((a, w) => a + idf(w), 0);
  if (!total) return 0;
  let best = 0;
  for (const set of itemSets) {
    let hit = 0;
    for (const w of uniq) if (set.has(w)) hit += idf(w);
    if (hit > best) best = hit;
  }
  return best / total;
}

function addTerms(bag, terms, weight) {
  for (const w of terms) bag.set(w, Math.max(bag.get(w) || 0, weight));
}

function fade(bag, f) {
  for (const [k, v] of bag) {
    if (v * f < 0.05) bag.delete(k);
    else bag.set(k, v * f);
  }
}

function buildTurns(session) {
  const turns = [];
  let cur = null;
  let last = null;
  for (const e of session.events) {
    if (e.kind === 'prompt' || e.kind === 'auto') {
      cur = {
        human: e.kind === 'prompt', t: e.t, text: e.text || '', command: e.command || null,
        cwd: e.cwd || session.cwd, idle: last === null ? Infinity : e.t - last, steps: [], session,
      };
      turns.push(cur);
    } else if (cur) {
      cur.steps.push(e);
    }
    last = e.t;
  }
  return turns;
}

// Agent time inside the window, split by local day
function agentTime(turn, since, until) {
  let prev = turn.t;
  let ms = 0;
  const byDay = new Map();
  for (const s of turn.steps) {
    const dt = s.t - prev;
    prev = s.t;
    if (dt <= 0 || s.t < since || s.t > until) continue;
    const add = Math.min(dt, DRIFT.idleCapMs);
    ms += add;
    const k = dayKey(s.t);
    byDay.set(k, (byDay.get(k) || 0) + add);
  }
  return { ms, byDay, end: prev };
}

/**
 * sessions: from readTranscripts(). planFor(cwd, dayKey): from readStatedPlans(), or null when there is no plan.
 */
export function analyzeDrift(sessions, { since, until = Date.now(), planFor = () => null, planNotes = [] } = {}) {
  const perSession = sessions.map(s => buildTurns(s));
  const turns = perSession.flat();
  const human = turns.filter(t => t.human);

  // Features per turn, then word weights across the whole span (a word in every turn tells you nothing)
  const fileCount = new Map();
  for (const t of human) {
    t.words = tokenize(t.text.slice(0, 2000));
    t.replyAll = tokenize(t.steps.map(s => s.words || '').join(' ').slice(0, 8000));
    t.files = new Set(t.steps.flatMap(s => s.files || []));
    t.fileWords = [...t.files].flatMap(f => pathTerms(f, t.cwd));
    for (const f of t.files) fileCount.set(f, (fileCount.get(f) || 0) + 1);
  }
  const df = new Map();
  for (const t of human) for (const w of new Set([...t.words, ...t.replyAll, ...t.fileWords])) df.set(w, (df.get(w) || 0) + 1);
  const n = human.length;
  const idf = (w) => Math.log((n + 1) / ((df.get(w) || 0) + 1)) + 1;
  // Files most turns touch (logs, plan files, notes) say nothing about the topic
  const everywhere = new Set([...fileCount].filter(([, c]) => c >= 5 && c > n * 0.2).map(([f]) => f));
  for (const t of human) {
    t.replyTop = [...new Set(t.replyAll)].sort((a, b) => idf(b) - idf(a)).slice(0, DRIFT.replyTerms);
    t.topicFiles = new Set([...t.files].filter(f => !everywhere.has(f)));
    const weight = [...new Set(t.words)].reduce((a, w) => a + idf(w), 0);
    // How much a turn says about its topic, used to name a detour after its most descriptive turn, not its first
    t.richness = weight * (shortName(t.text) ? 1 : 0);
    t.substantive = weight >= DRIFT.substantiveAt && !(CONTINUE.test(t.text) && t.words.length <= 5);
    t.states = t.substantive && (Boolean(t.command && PLAN_COMMANDS.has(t.command)) || PLAN_PREFIX.test(t.text));
  }

  const detours = [];
  const sources = { plan: 0, goal: 0, ask: 0 };
  const planNames = new Set();
  const scopes = new Set();
  let sittingId = 0;

  // "What you said" for a turn: the best any single plan item covers it, OR the opening ask, OR the topics that
  // earlier on-plan work has already established this sitting (so related follow-ups stay on)
  const onScore = (t, intent) => {
    const fromPlan = intent.items ? bestItemCoverage(t.words, intent.items, idf) : 0;
    const fromFocus = coverage(t.words, intent.focus, idf);
    const shared = [...t.topicFiles].filter(f => intent.files.has(f)).length;
    const fromFiles = t.topicFiles.size ? shared / t.topicFiles.size : 0;
    return Math.max(fromPlan, fromFocus, fromFiles);
  };

  const newThread = (t, lbl, score) => ({ label: lbl, bag: new Map(), head: t, best: t, ms: 0, score });
  const join = (t, th, score) => {
    t.label = th.label;
    t.thread = th;
    t.score = score;
    th.ms += t.time.ms;
    if (t.richness > th.best.richness) th.best = t; // name the thread after its most descriptive turn
    fade(th.bag, 0.6);
    addTerms(th.bag, t.words, 1);
    addTerms(th.bag, t.replyTop, 0.7);
    addTerms(th.bag, t.fileWords, 0.6);
  };

  // Walk each session in order: sittings, then threads, then labels
  for (const list of perSession) {
    let sitting = null;
    let thread = null;
    let pending = []; // "continue" and the like, before the sitting has said what it is for
    for (const t of list) {
      t.time = agentTime(t, since, until);
      if (!t.human) { t.label = 'auto'; continue; }

      if (!sitting || (t.idle >= DRIFT.sittingGapMs && t.substantive)) {
        sitting = { id: ++sittingId, intent: null };
        thread = null;
        pending = [];
        const plan = planFor(t.cwd, dayKey(t.t));
        if (plan && plan.items.length) {
          const items = plan.items.map(x => new Set(tokenize(x))).filter(s => s.size);
          sitting.intent = { source: 'plan', items, focus: new Map(), files: new Set() };
          plan.sources.forEach(x => planNames.add(x));
          scopes.add(plan.scope);
          sources.plan++;
        }
      }
      t.sitting = sitting.id;

      // A stated goal always resets what you said; with nothing written down, so does the sitting's first real ask.
      // The opening ask becomes the plan's one "item", so later work is matched against it the same way. When there
      // is no written plan, the next couple of asks are treated as part of laying out the task (people front-load
      // context), so a thin opening does not make the rest of the same task read as drift.
      if (t.states || (!sitting.intent && t.substantive)) {
        const focus = new Map();
        addTerms(focus, t.words, 1);
        addTerms(focus, t.replyTop, 0.5);
        addTerms(focus, t.fileWords, 0.5);
        sitting.intent = { source: t.states ? 'goal' : 'ask', items: [new Set(t.words)], focus, files: new Set(t.topicFiles), warm: 2, startT: t.t };
        sources[sitting.intent.source]++;
        thread = newThread(t, 'on', 1);
        for (const p of [...pending, t]) join(p, thread, 1);
        pending = [];
        continue;
      }
      if (!sitting.intent) { pending.push(t); continue; }

      // Warmup only counts while the task is still being laid out: substantive, budget left, and soon after it opened
      const warming = sitting.intent.warm > 0 && t.substantive && (t.t - sitting.intent.startT) <= DRIFT.warmupMs;
      // Non-substantive turns ("yes", "continue") ride the current thread; a real ask is re-judged against the plan
      if (!warming && thread && (!t.substantive || coverage(t.words, thread.bag, idf) >= DRIFT.continueAt)) {
        join(t, thread, thread.score);
      } else {
        const score = warming ? 1 : onScore(t, sitting.intent);
        thread = newThread(t, warming || score >= DRIFT.onAt ? 'on' : 'detour', score);
        if (thread.label === 'detour') detours.push(thread);
        join(t, thread, score);
        if (warming) { sitting.intent.items.push(new Set(t.words)); sitting.intent.warm--; }
      }
      // Work that is on what you said establishes its topic, so a related follow-up a few turns later is still on
      if (t.label === 'on') {
        fade(sitting.intent.focus, 0.85);
        addTerms(sitting.intent.focus, t.words, 1);
        addTerms(sitting.intent.focus, t.replyTop, 0.5);
        for (const f of t.topicFiles) sitting.intent.files.add(f);
      }
    }
    // A sitting that never said anything substantive counts as on whatever it was already doing
    for (const p of pending) p.label = 'on';
  }

  return summarize({ turns, human, detours, since, until, idf, sources, planNames, scopes: [...scopes], planNotes });
}

// What a run of turns touched, for naming a detour whose own words do not make a readable label
function touchedBy(turns) {
  return { files: turns.flatMap(t => [...(t.topicFiles || t.files || [])]), cwd: turns[0]?.cwd || '', home: homedir() };
}

function summarize({ turns, human, detours, since, until, idf, sources, planNames, scopes, planNotes }) {
  const counted = turns.filter(t => t.time && t.time.ms > 0 && (t.label === 'on' || t.label === 'detour'));
  const onMs = counted.filter(t => t.label === 'on').reduce((a, t) => a + t.time.ms, 0);
  const detourMs = counted.filter(t => t.label === 'detour').reduce((a, t) => a + t.time.ms, 0);
  const autoMs = turns.filter(t => t.label === 'auto' && t.time).reduce((a, t) => a + t.time.ms, 0);
  const agentMs = onMs + detourMs;

  // Days in the window, oldest first, including quiet ones
  const days = [];
  for (let d = new Date(since); d.getTime() <= until; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d.getTime());
    if (!days.find(x => x.day === k)) days.push({ day: k, onMs: 0, detourMs: 0 });
  }
  const lastKey = dayKey(until);
  if (!days.find(x => x.day === lastKey)) days.push({ day: lastKey, onMs: 0, detourMs: 0 });
  for (const t of counted) {
    for (const [k, ms] of t.time.byDay) {
      const d = days.find(x => x.day === k);
      if (d) d[t.label === 'on' ? 'onMs' : 'detourMs'] += ms;
    }
  }
  const busiest = Math.max(0, ...days.map(d => d.onMs + d.detourMs));
  const worst = days
    .filter(d => d.onMs + d.detourMs >= Math.max(30 * MIN, busiest * 0.15) && d.detourMs > 0)
    .map(d => ({ ...d, share: d.detourMs / (d.onMs + d.detourMs) }))
    .sort((a, b) => b.share - a.share || b.detourMs - a.detourMs)[0] || null;

  // A detour episode is a run of off-plan turns you did in one go before coming back. Grouping the contiguous run,
  // then naming it after its most descriptive turn, keeps "bin emptied btw" inside the footage-move it belongs to.
  const episodes = [];
  const bySitting = new Map();
  for (const t of human) {
    if (!t.sitting) continue;
    if (!bySitting.has(t.sitting)) bySitting.set(t.sitting, []);
    bySitting.get(t.sitting).push(t);
  }
  for (const list of bySitting.values()) {
    let run = null;
    const close = () => { if (run && run.ms > 0) episodes.push(run); run = null; };
    for (const t of list.sort((a, b) => a.t - b.t)) {
      if (t.label === 'detour') {
        if (!run) run = { ms: 0, start: t.t, end: t.t, turns: [] };
        run.ms += t.time.ms;
        run.end = Math.max(run.end, t.time.end);
        run.turns.push(t);
      } else if (t.label === 'on') {
        close();
      }
    }
    close();
  }
  for (const e of episodes) e.best = e.turns.reduce((a, b) => (b.richness > a.richness ? b : a), e.turns[0]);

  // The longest single episode is the day's deepest rabbit hole
  const longest = episodes.slice().sort((a, b) => b.ms - a.ms)[0] || null;
  const streak = longest ? {
    ms: longest.ms,
    wallMs: longest.end - longest.start,
    start: longest.start,
    detours: longest.turns.filter(t => t.thread && t.thread.head === t).length,
    name: labelName(longest.best.text, touchedBy(longest.turns), categorize(longest.turns.map(t => t.text).join(' '))),
    category: categorize(longest.turns.map(t => t.text).join(' ')),
  } : null;

  // Episodes on the same subject across the week are one named detour, counted each time it pulled you away
  const clusters = [];
  for (const e of episodes.filter(x => x.best.richness > 0).sort((a, b) => a.start - b.start)) {
    const own = bagOf(e.best.words);
    const c = clusters.find(x => coverage(e.best.words, x.bag, idf) >= DRIFT.clusterAt || coverage(x.best.words, own, idf) >= DRIFT.clusterAt);
    if (c) {
      c.ms += e.ms;
      c.episodes.push(e);
      if (e.best.richness > c.best.richness) c.best = e.best;
      addTerms(c.bag, e.best.words, 1);
    } else {
      clusters.push({ best: e.best, bag: own, ms: e.ms, episodes: [e] });
    }
  }
  // Two detours that end up with the same label (several fall back to "code") are one row
  const mergeSame = (list) => {
    const by = new Map();
    for (const d of list) {
      const k = d.name;
      const c = by.get(k);
      if (c) { c.ms += d.ms; c.times += d.times; c.first = Math.min(c.first, d.first); } else by.set(k, { ...d });
    }
    return [...by.values()];
  };
  const named = mergeSame(clusters.map(c => ({
    name: labelName(c.best.text, touchedBy(c.episodes.flatMap(e => e.turns)), categorize(c.episodes.map(e => e.best.text).join(' '))),
    category: categorize(c.episodes.map(e => e.best.text).join(' ')),
    ms: c.ms,
    times: c.episodes.length,
    first: Math.min(...c.episodes.map(e => e.start)),
  })).filter(d => d.name)).sort((a, b) => b.ms - a.ms);

  const active = new Set(counted.map(t => t.session));
  const inSpan = human.filter(t => t.t >= since && t.t <= until);
  const agentsUsed = { claude: 0, codex: 0 };
  for (const s of active) agentsUsed[s.agent] = (agentsUsed[s.agent] || 0) + 1;

  return {
    available: agentMs > 0,
    since, until,
    share: agentMs ? onMs / agentMs : 0,
    totals: {
      agentMs, onMs, detourMs, autoMs,
      prompts: inSpan.length,
      sessions: active.size,
      sittings: new Set(counted.map(t => t.sitting)).size,
    },
    agents: agentsUsed,
    days,
    worstDay: worst,
    streak,
    detours: named,
    detourCount: named.length,
    source: {
      plan: sources.plan, goal: sources.goal, ask: sources.ask,
      planNames: [...planNames],
      scope: scopes.includes('list') ? 'list' : scopes.includes('project') ? 'project' : 'session',
      notes: planNotes,
    },
    // Every labelled ask, for --json: when, how long, which label, and how the score came out
    turns: human.filter(t => t.time && t.t >= since && t.t <= until).map(t => ({
      t: new Date(t.t).toISOString(),
      agent: t.session.agent,
      session: String(t.session.id).slice(0, 8),
      sitting: t.sitting,
      label: t.label,
      score: t.score == null ? null : Math.round(t.score * 100) / 100,
      opens: Boolean(t.thread && t.thread.head === t),
      minutes: Math.round(t.time.ms / MIN),
      ask: shortName(t.text, { maxWords: 14, maxChars: 90 }),
    })),
  };
}

function bagOf(words) {
  const bag = new Map();
  addTerms(bag, words, 1);
  return bag;
}
