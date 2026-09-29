import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'path';
import { homedir } from 'os';

/**
 * "What you said you'd do", when you wrote it down. Two kinds of written plan are read, both local:
 *   - Mover OS: the day's Daily Note (Focus and Tasks), and the plan.md of the vault project a session ran in
 *   - anywhere else: a PLAN.md, plan.md or TODO.md in the session's project folder
 * Only checklist items and focus lines are read. Nothing else in these files is used, and nothing leaves the machine.
 */

const PLAN_NAMES = ['PLAN.md', 'plan.md', 'TODO.md', 'todo.md'];
// A plan with more open items than this is a long-running tracker, not a short to-do list. It is still used, as the
// project's vocabulary, but the report says "on the project" rather than "on this week's list".
export const BIG_PLAN_ITEMS = 60;
const CHECKBOX = /^\s*[-*+]\s+\[([ xX~\/>-])\]\s+(.+)$/;

// Mover's vault, from ~/.mover/config.json. Only vaultPath is read.
export function moverVault(configPath = join(homedir(), '.mover', 'config.json')) {
  if (!existsSync(configPath)) return null;
  try {
    const vault = JSON.parse(readFileSync(configPath, 'utf-8')).vaultPath;
    return typeof vault === 'string' && existsSync(vault) ? vault : null;
  } catch {
    return null;
  }
}

// Checklist items and focus lines, cleaned of Obsidian syntax and Mover's bookkeeping tags
export function cleanItem(text) {
  return String(text)
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\s\^[\w-]+\s*$/, '')
    .replace(/\[(Added|Due|Moved|Carried|From|UNVERIFIED|HYPOTHESIS ONLY)[^\]]*\]/gi, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// A template placeholder like "[The ONE thing that makes today a win]" is not a plan
const isPlaceholder = (s) => !s || /^\[.*\]$/.test(s) || /^\(.*\)$/.test(s);

// Section headers that are structure or bookkeeping, not a statement of work
const BORING_HEADER = /^(#+\s*)?(\d+\.|phase\b|execution log|the roadmap|the north star|the architecture|changelog|notes|project control|deferred|resolved|table of|contents|appendix|status|done|completed|in progress|todo|backlog|log\b)/i;

export function parsePlanText(text) {
  const open = [];   // still-to-do items: the plain reading of "what you said you'd do"
  const all = [];    // every item, open or done, plus real section headers: the project's stated work, for matching
  for (const line of String(text).split('\n')) {
    const m = line.match(CHECKBOX);
    if (m) {
      const item = cleanItem(m[2]);
      if (isPlaceholder(item) || m[1] === '-') continue; // placeholder or dropped
      all.push(item);
      // [x] done, [~] done but unchecked in Mover's convention; everything else is still open
      if (!/[xX~]/.test(m[1])) open.push(item);
      continue;
    }
    // Section headers carry the intent of long trackers (Mover writes the verbatim brief into each "## R157 ..."),
    // which the terse checkboxes below them do not. Skip the structural and bookkeeping ones.
    const h = line.match(/^(#{2,4})\s+(.+?)\s*#*$/);
    if (h && !BORING_HEADER.test(line)) {
      const item = cleanItem(h[2].replace(/[🏁🏗️⚡🧹🧠📚🔄🎓✅⚙️📋🔧]/gu, ''));
      if (item.length > 6 && !isPlaceholder(item)) all.push(item);
    }
  }
  return { open, all };
}

// A Daily Note's Focus lines (Single Test, The Hard Thing) and its task list. The Sacrifice is what you said you
// would NOT do, so it is left out.
export function parseDailyNote(text) {
  const items = [];
  let section = null;
  for (const line of String(text).split('\n')) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { section = /^focus/i.test(h[1]) ? 'focus' : /^tasks/i.test(h[1]) ? 'tasks' : null; continue; }
    if (/^#\s/.test(line)) { section = null; continue; }
    if (section === 'focus') {
      const f = line.match(/^\s*[-*]\s+\*\*(Single Test|The Hard Thing|Focus|Main Quest)[^*]*\*\*:?\s*(.+)$/i);
      if (f) {
        const item = cleanItem(f[2]);
        if (!isPlaceholder(item)) items.push(item);
      }
    } else if (section === 'tasks') {
      const m = line.match(CHECKBOX);
      if (m && m[1] !== '-') {
        const item = cleanItem(m[2]);
        if (!isPlaceholder(item)) items.push(item);
      }
    }
  }
  return items;
}

export function dailyNotePath(vault, dayKey) {
  return join(vault, '02_Areas', 'Engine', 'Dailies', dayKey.slice(0, 7), `Daily - ${dayKey}.md`);
}

const inside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

// The plan file for a session's folder: in a Mover vault, the project's plan.md (or dev/plan.md); anywhere else,
// the nearest PLAN.md / plan.md / TODO.md between the folder and its git root
export function findPlanFile(cwd, vault) {
  if (!cwd) return null;
  const dir = resolve(cwd);
  if (vault && inside(dir, join(vault, '01_Projects'))) {
    const project = relative(join(vault, '01_Projects'), dir).split(sep)[0];
    if (!project) return null;
    const root = join(vault, '01_Projects', project);
    for (const f of ['plan.md', join('dev', 'plan.md')]) if (existsSync(join(root, f))) return join(root, f);
    return null;
  }
  const home = homedir();
  let d = dir;
  for (let i = 0; i < 6; i++) {
    for (const name of PLAN_NAMES) {
      const f = join(d, name);
      try { if (statSync(f).isFile()) return f; } catch { /* not here */ }
    }
    if (existsSync(join(d, '.git')) || d === home) break;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}

/**
 * Plan lookup for the analyzer: planFor(cwd, dayKey) returns { sources: [...], items } or null.
 * `notes` records plans that were found and set aside, so the report can say why.
 */
export function readStatedPlans({ vault = moverVault() } = {}) {
  const planCache = new Map();
  const dailyCache = new Map();
  const notes = new Map();

  const plan = (cwd) => {
    const file = findPlanFile(cwd, vault);
    if (!file) return null;
    if (!planCache.has(file)) {
      let parsed = null;
      try { parsed = parsePlanText(readFileSync(file, 'utf-8')); } catch { /* unreadable */ }
      const name = file.split(sep).pop();
      if (parsed && parsed.all.length) {
        const big = parsed.open.length > BIG_PLAN_ITEMS;
        // A short to-do list is matched item by item. A long tracker is matched as a whole: any of the project's
        // work counts as on the plan, so "on-plan" reads as "on this project".
        planCache.set(file, { name, items: parsed.all, scope: big ? 'project' : 'list', open: parsed.open.length });
        if (big) notes.set(file, { name, open: parsed.open.length, scope: 'project' });
      } else {
        planCache.set(file, null);
      }
    }
    return planCache.get(file);
  };

  const daily = (dayKey) => {
    if (!vault) return null;
    if (!dailyCache.has(dayKey)) {
      const file = dailyNotePath(vault, dayKey);
      let items = [];
      try { items = parseDailyNote(readFileSync(file, 'utf-8')); } catch { /* no note that day */ }
      dailyCache.set(dayKey, items.length ? { name: 'Daily Note', items, scope: 'list' } : null);
    }
    return dailyCache.get(dayKey);
  };

  return {
    mover: Boolean(vault),
    // A day's Daily-Note focus is the sharpest statement of intent, so it leads; the project's plan backs it.
    planFor(cwd, dayKey) {
      const found = [daily(dayKey), plan(cwd)].filter(Boolean);
      if (!found.length) return null;
      return {
        sources: found.map(f => f.name),
        scope: found.some(f => f.scope === 'list') ? 'list' : 'project',
        items: found.flatMap(f => f.items),
      };
    },
    notes: () => [...notes.values()],
  };
}
