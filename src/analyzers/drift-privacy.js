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
