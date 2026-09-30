/**
 * What the drift card is allowed to show of your prompts.
 * Always on: keys, tokens, links, file paths, emails and long numbers are replaced before any words reach the card.
 * With --redact: detour names become categories, so no prompt text is shown at all.
 */

// Shapes of the credentials people paste most. Anything key-like that no rule names is caught by the last two.
const SECRETS = [
  /\bsk-(?:ant-|proj-|live-|test-|or-)?[A-Za-z0-9_-]{12,}/g,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{16,}/g,
  /\bglpat-[A-Za-z0-9_-]{16,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bnpm_[A-Za-z0-9]{30,}/g,
  /\b(?:rk|pk|sk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{3,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:bearer|token|api[_-]?key|secret|password|passwd|pwd)\s*[:=]\s*\S+/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
  // 24+ characters mixing upper case, lower case and digits, with no spaces: almost never a word
  /\b(?=[A-Za-z0-9+/_-]*\d)(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])[A-Za-z0-9+/_-]{24,}={0,2}/g,
];

const URL = /\b(?:https?:\/\/|www\.)\S+|\b[\w-]+\.(?:com|dev|io|ai|app|co|net|org|so|sh|me|gg|ly|uk|xyz)\/\S*/gi;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
// Home paths, absolute paths with at least two parts (so "/goal" survives), Windows paths, and relative paths
// that end in a file extension
const PATH = /~\/[\w.@\/-]+|(?<![\w.])\/[\w.@-]+(?:\/[\w.@-]*)+|\b[A-Za-z]:\\[^\s"']+|\b(?:[\w.@-]+\/)+[\w@-]+\.[A-Za-z0-9]{1,6}\b/g;
// Nine or more digits (phone, card, account numbers); dates like 2026-09-29 have eight and are kept
const LONG_NUMBER = /\b\d(?:[ -]?\d){8,}\b/g;

export function scrub(text) {
  let s = String(text || '');
  for (const re of SECRETS) s = s.replace(re, ' [key] ');
  return s
    .replace(URL, ' [link] ')
    .replace(EMAIL, ' [email] ')
    .replace(PATH, ' [file] ')
    .replace(LONG_NUMBER, ' [number] ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Chat filler at the front of a prompt, dropped so the name starts at the point
const LEAD_FILLER = new Set(['yo', 'bro', 'bruh', 'broski', 'brudda', 'mate', 'man', 'ok', 'okay', 'alr', 'alright', 'so',
  'and', 'also', 'btw', 'but', 'nah', 'yeah', 'yh', 'yes', 'hey', 'hi', 'oh', 'well', 'right', 'um', 'uh', 'ngl', 'tbh',
  'lol', 'gng', 'wait', 'hmm', 'actually', 'basically', 'look', 'listen', 'now', 'then', 'please', 'pls',
  'i', 'meant', 'mean', 'means', 'think', 'thought', 'saying', 'wondering', 'idk', 'just', 'like', 'the', 'thing', 'is',
  'can', 'could', 'would', 'will', 'you', 'we', 'do', 'does', 'should', 'lets', 'let']);

/**
 * A detour's name: the start of the user's own prompt, scrubbed, lower-cased and cut to a short phrase.
 * Returns '' when nothing readable is left (a prompt that was only a link, say).
 */
export function shortName(text, { maxWords = 7, maxChars = 44 } = {}) {
  let s = scrub(String(text || '').replace(/\[Image[^\]]*\]/gi, ' '))
    // The placeholders scrub() leaves ([link], [file], ...) carry no meaning in a name, so drop them entirely
    .replace(/\[(?:key|link|file|email|number)\]/g, ' ')
    .replace(/[‘’]/g, "'").replace(/["“”`*_#>@]/g, '').replace(/\s+/g, ' ').trim();
  // The first sentence that says something; "Why?" alone borrows the next one
  const parts = s.split(/(?<=[.?!])\s+|\n+/).map(p => p.trim()).filter(Boolean);
  let phrase = '';
  for (const p of parts) {
    phrase = phrase ? `${phrase} ${p}` : p;
    if (phrase.split(' ').filter(w => !LEAD_FILLER.has(w.toLowerCase())).length >= 3) break;
  }
  let words = phrase.split(' ').filter(Boolean);
  while (words.length && LEAD_FILLER.has(words[0].toLowerCase().replace(/[^a-z]/g, ''))) words.shift();
  // Placeholders left by scrub() carry no meaning at the edges
  while (words.length && /^\[\w+\]$/.test(words[words.length - 1])) words.pop();
  if (!words.some(w => /[a-z]{2,}/i.test(w) && !/^\[\w+\]$/.test(w))) return '';
  let out = '';
  let cut = false;
  for (const [i, w] of words.entries()) {
    const next = out ? `${out} ${w}` : w;
    if (i >= maxWords || next.length > maxChars) { cut = true; break; }
    out = next;
  }
  out = out.replace(/[,;:\-]+$/, '').toLowerCase();
  return cut ? `${out}…` : out.replace(/[.!]+$/, '');
}

// For --redact: the kind of detour, never its words. First matching rule wins.
const CATEGORIES = [
  ['food and health', /\b(food|eat|ate|eating|cook|cooking|cooked|recipes?|chicken|rice|protein|calories?|kcal|meals?|lunch|dinner|breakfast|snacks?|gym|workout|weights?|sleep|hrv|spo2|steps|doctor|ill|sick|cough|diet|macros?|brownies?)\b/],
  ['shopping', /\b(buy|bought|prices?|deals?|offers?|cheap|cheaper|discount|orders?|argos|amazon|ebay|marketplace|freezer|fridge|laptop|macbook|listing|shop|shopping|stock)\b|£/],
  ['paperwork', /\b(ticket|appeal|fine|parking|insurance|bank|tax|invoice|letter|form|council|visa|passport|contract|claim|refund)\b/],
  ['setup and tooling', /\b(install|setup|set up|config|settings|terminal|sessions?|account|accounts|login|log in|permissions?|mcp|remote|disk|storage|cache|space|update|upgrade|plugins?|extensions?|hooks?|cli|history)\b/],
  ['design', /\b(design|ui|ux|fonts?|colou?rs?|logo|brand|branding|mascots?|landing|layout|figma|icons?|animation|motion|screens?)\b/],
  ['content and marketing', /\b(posts?|tweets?|videos?|reels?|captions?|content|launch|viral|marketing|seo|newsletter|youtube|tiktok|instagram|x\.com|audience)\b/],
  ['research', /\b(research|analy[sz]e|analysis|compare|markets?|competitors?|trends?|bookmarks?|threads?|reddit|articles?|news|ipo|benchmarks?)\b/],
  ['money', /\b(money|revenue|pricing|business|income|profit|sales|sell|selling|customers?|startup)\b/],
  ['code', /\b(bug|fix|error|refactor|tests?|deploy|build|api|function|script|database|db|server|endpoint|repo|commit|branch|code)\b/],
];

export function categorize(text) {
  const s = String(text || '').toLowerCase();
  for (const [name, re] of CATEGORIES) if (re.test(s)) return name;
  return 'something else';
}

// ---------------------------------------------------------------------------------------------------------------
// Readable labels for the drift section. shortName() above keeps the raw start of a prompt; labelName() turns it into
// something a person recognises, or says what the detour touched, or names its kind. scrub() runs first, always.
// ---------------------------------------------------------------------------------------------------------------

// Openers that only lead into the point. Multi-word ones first so "question is" goes as one.
const OPENERS = [
  'at the', 'on the', 'in the', 'question is', 'the question is', 'can you', 'could you', 'would you', 'will you', 'i want to', 'i want',
  'i need to', 'i need', 'i would like to', 'make sure', 'lets', "let's", 'let us', 'ok so', 'okay so', 'so', 'also', 'ok', 'okay', 'and', 'but',
  'i think that', 'i think', 'i feel like', 'i feel', 'i guess', 'i mean', 'i was thinking', 'i dont know', "i don't know", 'maybe', 'btw', 'yo', 'hey', 'please', 'pls', 'now', 'then', 'actually', 'basically', 'well', 'the', 'a', 'an', 'i',
];
// Words that carry no topic on their own, for counting how much a label really says
const THIN = new Set(`a an the and or but nor so if of to in on at by for with from as is am are was were be been being it its it's this that these those
  here there i me my we our you your he she they them his her their do does did done doing have has had not no yes yeah
  can could would should will shall may might must just also too very really quite much many more most some any all etc
  what when where which who whom whose why how than then thus about into onto over under up down out off again still even
  thing things stuff bit lot lots like kind sort one ones`.split(/\s+/).filter(Boolean));
// A label that ends on one of these was cut mid-thought
const DANGLING = new Set(['or', 'and', 'but', 'the', 'a', 'an', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'was', 'is', 'are', 'that', 'this',
  'so', 'if', 'as', 'by', 'from', 'etc', 'how', 'what', 'my', 'your', 'our', 'their', 'it', 'its']);

const LABEL_MAX = 32;

/** The prompt with everything that reads as markup or decoration removed: tags, [Image #1], pasted-content ids, bullets. */
function tidy(text) {
  return String(text || '')
    .replace(/\[(?:Image|Pasted|Attached|File)[^\]]*\]/gi, ' ')
    // <pastedcontent id=2b8c ...>, also when the closing > never came
    .replace(/<\/?[a-z][\w:-]*(?:\s+[\w:-]+\s*=\s*[^\s>]+)*\s*>?/gi, ' ')
    .replace(/<[^>\n]*>/g, ' ')
    .replace(/[●•·▪◦○◉■□▶►→←↑↓✓✗✔✘★☆]/g, ' ')
    .replace(/(?:^|\s)[-*>#|]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const plain = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
const meaningful = (w) => { const p = plain(w); return p.length >= 2 && /[a-z]/.test(p) && !THIN.has(p) && !/^\d/.test(p); };

// "1/5 skill gates" -> "skill gates": numbering, fractions and lone digits at the front say nothing
const stripLeadNumbers = (s) => s.replace(/^(?:[\d#./:-]+\s+)+/, '');

function stripOpeners(s) {
  let out = s;
  for (let i = 0; i < 6; i++) {
    const low = out.toLowerCase();
    const hit = OPENERS.find(o => low === o || low.startsWith(o + ' '));
    if (!hit) break;
    out = out.slice(hit.length).trim();
  }
  return out;
}

// Cut to the cap at a word boundary, never ending on a dangling word
function capWords(words) {
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > LABEL_MAX) break;
    out = next;
  }
  // A cut inside brackets leaves "skill gates (design and writing": drop the open bracket and what follows
  out = out.replace(/\s*[(\[][^)\]]*$/, '');
  const parts = out.split(' ');
  while (parts.length > 1 && DANGLING.has(plain(parts[parts.length - 1]))) parts.pop();
  return parts.join(' ');
}

/** The readable label a prompt earns on its own, or '' when it does not say enough to be one. */
export function promptLabel(text) {
  const cleaned = tidy(scrub(tidy(text)).replace(/\[(?:key|link|file|email|number)\]/g, ' '));
  const body = stripLeadNumbers(stripOpeners(stripLeadNumbers(cleaned)))
    .replace(/[‘’]/g, "'").replace(/["“”`*_@]/g, '').replace(/(?:\.{2,}|…)+\s*$/, '').replace(/\s+/g, ' ').trim();
  // The first sentence that says something
  const parts = body.split(/(?<=[.?!])\s+|\n+/).map(p => p.trim()).filter(Boolean);
  let phrase = '';
  for (const p of parts) {
    phrase = phrase ? `${phrase} ${p}` : p;
    if (phrase.split(' ').filter(meaningful).length >= 3) break;
  }
  const words = phrase.replace(/[.?!,;:]+$/, '').split(' ').filter(Boolean);
  if (words.filter(meaningful).length < 3) return '';
  // Looks like a fragment: it was cut off, or it ends on a joining word
  if (DANGLING.has(plain(words[words.length - 1])) && words.length <= 7) return '';
  const label = capWords(words.slice(0, 8)).replace(/[,;:\-]+$/, '').toLowerCase();
  return label.split(' ').filter(meaningful).length >= 3 ? label : '';
}

const FOLDER_SKIP = new Set(['users', 'user', 'home', 'documents', 'desktop', 'downloads', 'library', 'private', 'tmp', 'var', 'opt', 'node_modules', 'dist', 'build', '.git', '.claude']);
const EXT_NOUN = { md: 'notes', mdx: 'notes', txt: 'notes', html: 'pages', htm: 'pages', css: 'styles', scss: 'styles', js: 'code', mjs: 'code', ts: 'code', tsx: 'code', jsx: 'code', py: 'code', sh: 'scripts', json: 'data', yml: 'config', yaml: 'config', toml: 'config', png: 'images', jpg: 'images', jpeg: 'images', svg: 'images', pdf: 'documents' };

/**
 * What a run of work touched: the folder its files mostly sit in ("site/compare pages"), else the project folder it ran in.
 * `files` are absolute paths, `cwd` the folder the session ran in. Returns '' when there is nothing safe to say.
 */
export function touchedLabel(files = [], cwd = '', home = '') {
  const tally = new Map();
  const exts = new Map();
  const cwdClean = String(cwd || '').replace(/[\\/]+$/, '');
  for (const f of files) {
    let p = String(f);
    if (cwdClean && p.startsWith(cwdClean + '/')) p = p.slice(cwdClean.length + 1);
    else p = p.split(/[\\/]/).slice(-3).join('/');
    const segs = p.split(/[\\/]/).filter(Boolean);
    const file = segs.pop() || '';
    const homeBase = String(home || '').split(/[\\/]/).filter(Boolean).pop();
    const dirs = segs.filter(s => !FOLDER_SKIP.has(s.toLowerCase()) && !s.startsWith('.') && s !== homeBase).slice(0, 2);
    const ext = (file.split('.').pop() || '').toLowerCase();
    if (dirs.length) {
      const k = dirs.join('/');
      tally.set(k, (tally.get(k) || 0) + 1);
      if (EXT_NOUN[ext]) exts.set(k + '|' + EXT_NOUN[ext], (exts.get(k + '|' + EXT_NOUN[ext]) || 0) + 1);
    }
  }
  const pretty = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  const best = [...tally].sort((a, b) => b[1] - a[1])[0];
  if (best) {
    const noun = [...exts].filter(([k]) => k.startsWith(best[0] + '|')).sort((a, b) => b[1] - a[1])[0];
    const dir = pretty(best[0]);
    const word = noun ? noun[0].split('|')[1] : '';
    return word && !dir.endsWith(word) ? `${dir} ${word}` : dir;
  }
  // No folder to name: the project the work ran in, unless that is the home folder or plumbing
  const base = cwdClean.split(/[\\/]/).filter(Boolean).pop() || '';
  const homeBase = String(home || '').split(/[\\/]/).filter(Boolean).pop();
  if (base && base !== homeBase && !FOLDER_SKIP.has(base.toLowerCase())) return pretty(base);
  return '';
}

/**
 * The name shown for a detour. Its own words when they make a readable label; else what it touched; else its kind.
 * Everything that reaches the page has been through scrub() and is at most ~32 characters.
 * `touched`: { files, cwd, home } for the work the detour covered.
 */
export function labelName(text, touched = {}, category = categorize(text)) {
  const own = promptLabel(text);
  if (own) return own;
  const t = touchedLabel(touched.files, touched.cwd, touched.home);
  const safe = t ? scrub(t).replace(/\[(?:key|link|file|email|number)\]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (safe && meaningful(safe.split(' ')[0]) && safe.length <= LABEL_MAX + 12) return capWords(safe.split(' '));
  return category;
}
