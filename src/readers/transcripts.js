import { openSync, readSync, closeSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { projectRoots } from './jsonl-reader.js';

/**
 * Transcripts for the drift report: what the user asked, and when the agent was working.
 * Reads Claude Code sessions (~/.claude/projects) and Codex rollouts (~/.codex/sessions).
 *
 * Each session comes back as time-ordered events:
 *   { t, kind: 'prompt', text, cwd }   something the user typed
 *   { t, kind: 'auto' }                work started by a script or hook, not by the user
 *   { t, kind: 'step', words, files }  the agent working: its visible reply text, and the files its tools named
 */

const DAY = 86400000;

// Files are read in chunks, never whole: one long-running session can pass 800 MB, and a JS string stops at ~512 MB.
export function forEachLine(filePath, fn) {
  let fd;
  try { fd = openSync(filePath, 'r'); } catch { return; }
  const buf = Buffer.allocUnsafe(1 << 22);
  let carry = null;
  try {
    let n;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      let start = 0;
      for (;;) {
        const nl = buf.indexOf(10, start);
        if (nl === -1 || nl >= n) break;
        const piece = buf.subarray(start, nl);
        const line = carry ? Buffer.concat([carry, piece]) : piece;
        carry = null;
        fn(line);
        start = nl + 1;
      }
      if (start < n) {
        const rest = Buffer.from(buf.subarray(start, n)); // copied, because buf is reused by the next read
        carry = carry ? Buffer.concat([carry, rest]) : rest;
      }
    }
    if (carry && carry.length) fn(carry);
  } catch { /* a file that fails mid-read keeps what was read */ }
  finally { closeSync(fd); }
}

export function defaultCodexDir() {
  return process.env.CODEX_HOME || join(homedir(), '.codex');
}

/**
 * Sessions with activity between `since` and `until` (ms). Events from up to `lookbackMs` earlier are kept, so a
 * session resumed inside the window still knows what it was opened for.
 */
export function readTranscripts({ claudeDir, codexDir = defaultCodexDir(), since, until = Date.now(), lookbackMs = 2 * DAY } = {}) {
  const from = since - lookbackMs;
  const sessions = [];
  const seen = new Set(); // resumed sessions copy earlier records into the new file; each record counts once

  for (const root of claudeDir ? projectRoots(claudeDir) : []) {
    for (const file of recentFiles(root, since, 1)) {
      const s = readClaudeSession(file, from, until, seen);
      if (s.events.length) sessions.push(s);
    }
  }

  const codexSessions = join(codexDir || '', 'sessions');
  if (codexDir && existsSync(codexSessions)) {
    // Codex files sit under YYYY/MM/DD of the day the thread STARTED, and a thread can stay open for weeks,
    // so every day folder is checked by modification time rather than by name
    for (const file of recentFiles(codexSessions, since, 3)) {
      const s = readCodexSession(file, from, until);
      if (s.events.length) sessions.push(s);
    }
  }

  for (const s of sessions) s.events.sort((a, b) => a.t - b.t);
  return sessions;
}

// .jsonl files `depth` folders below root that were written to after `since`
function recentFiles(root, since, depth) {
  const out = [];
  const walk = (dir, d) => {
    let names;
    try { names = readdirSync(dir); } catch { return; }
    for (const name of names) {
      const full = join(dir, name);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) { if (d > 0) walk(full, d - 1); }
      else if (d === 0 && name.endsWith('.jsonl') && st.mtimeMs >= since) out.push(full);
    }
  };
  walk(root, depth);
  return out;
}

// ---------------------------------------------------------------- Claude Code

// Text Claude Code writes into the user's turn that the user did not type
const NOT_TYPED = /^\s*(<(local-command-|system-reminder|task-notification|bash-(input|stdout|stderr)|user-memory-input)|\[Request interrupted|Caveat: The messages below|This session is being continued|Base directory for this skill|Continue from where you left off\.?\s*$)/;
// Work the machine started on its own: scheduled hooks, goal check-ins, auto-resume heartbeats, and the
// "limit reset, continue" nudge the runner injects after a usage cap
const AUTO_WORK = /^\s*(Stop hook feedback|Goal check-in|<heartbeat|<automation|\[scheduled|(I hit|hit) (my )?usage limit)/i;
// Built-in commands whose arguments are settings, not a request
const BUILTIN = new Set(['/clear', '/compact', '/model', '/effort', '/resume', '/rewind', '/exit', '/config', '/login', '/logout',
  '/permissions', '/add-dir', '/mcp', '/cost', '/usage', '/status', '/doctor', '/help', '/memory', '/init', '/theme', '/vim',
  '/terminal-setup', '/ide', '/hooks', '/agents', '/bug', '/release-notes', '/export', '/context', '/statusline', '/fast',
  '/output-style', '/plugin', '/upgrade', '/privacy-settings', '/remote-control', '/rename', '/tag', '/color']);

function readClaudeSession(file, from, until, seen) {
  const s = { agent: 'claude', id: basename(file, '.jsonl'), cwd: null, events: [] };
  forEachLine(file, (line) => {
    // Cheap skips before parsing: harness records, file attachments and tool output are most of the bytes
    const head = line.subarray(0, 400).toString('latin1');
    if (head.startsWith('{"type":"') && !/^\{"type":"(user|assistant)"/.test(head)) return;
    if (head.includes('"attachment":{')) return;
    if (head.includes('"content":[{"tool_use_id"') || head.includes('"content":[{"type":"tool_result"')) return;

    let r;
    try { r = JSON.parse(line.toString('utf8')); } catch { return; }
    if (r.type !== 'user' && r.type !== 'assistant') return;
    if (r.isSidechain) return;
    const t = Date.parse(r.timestamp);
    if (!(t >= from && t <= until)) return;
    if (r.uuid) {
      if (seen.has(r.uuid)) return;
      seen.add(r.uuid);
    }
    if (r.cwd) s.cwd = r.cwd;

    if (r.type === 'assistant') {
      const step = claudeStep(r);
      s.events.push({ t, kind: 'step', words: step.words, files: step.files });
      return;
    }
    const e = claudeUserEvent(r);
    if (e) s.events.push({ t, ...e, cwd: r.cwd || s.cwd });
  });
  return s;
}

function claudeUserEvent(r) {
  if (r.isCompactSummary) return null;
  const kind = r.origin?.kind;
  // A background agent reporting back continues the user's request
  if (kind === 'task-notification' || kind === 'peer') return { kind: 'step', words: '', files: [] };
  const text = userText(r.message?.content);
  if (text === null) return null;
  if (/^\s*<task-notification>/.test(text)) return { kind: 'step', words: '', files: [] };
  if (AUTO_WORK.test(text)) return { kind: 'auto' };
  if (r.isMeta) return null;
  if (kind && kind !== 'human') return null;
  // Runs started from a script (claude -p, the SDK): nobody typed these
  if (r.promptSource === 'sdk' || /^sdk/.test(r.entrypoint || '')) return { kind: 'auto' };
  if (text.startsWith('<command-name>') || text.startsWith('<command-message>')) return commandPrompt(text);
  if (!text.trim() || NOT_TYPED.test(text)) return null;
  return { kind: 'prompt', text: text.trim() };
}

// String content, or the text blocks of an array; null when the record is tool output
function userText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  if (content.some(b => b?.type === 'tool_result')) return null;
  return content.filter(b => b?.type === 'text').map(b => b.text || '').join('\n');
}

// "/goal ship the landing page" is stored as tags; the words after a command are the user's own, sometimes the plan itself
function commandPrompt(text) {
  const name = text.match(/<command-name>\s*([^<\s]+)\s*<\/command-name>/)?.[1];
  const args = text.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1]?.trim();
  if (!name || !args || BUILTIN.has(name)) return null;
  return { kind: 'prompt', text: args, command: name };
}

function claudeStep(r) {
  const blocks = Array.isArray(r.message?.content) ? r.message.content : [];
  let words = '';
  const files = [];
  for (const b of blocks) {
    if (b?.type === 'text' && b.text) words += (words ? ' ' : '') + b.text.slice(0, 1500);
    else if (b?.type === 'tool_use' && b.input && typeof b.input === 'object') {
      const p = b.input.file_path || b.input.notebook_path || b.input.path;
      if (typeof p === 'string' && p) files.push(p);
    }
  }
  return { words: words.slice(0, 2000), files };
}

// ---------------------------------------------------------------- Codex

// Context Codex puts in the user's slot that the user did not type
const CODEX_NOT_TYPED = /^\s*(<(environment_context|user_instructions|recommended_plugins|app-context|turn_aborted|subagent)|# AGENTS\.md)/;
const CODEX_STEP_ITEMS = new Set(['function_call', 'custom_tool_call', 'local_shell_call', 'function_call_output',
  'custom_tool_call_output', 'reasoning', 'web_search_call', 'message']);
const CODEX_STEP_EVENTS = new Set(['agent_message', 'task_complete', 'token_count', 'exec_command_end', 'patch_apply_end', 'turn_aborted']);

function readCodexSession(file, from, until) {
  const s = { agent: 'codex', id: basename(file, '.jsonl'), cwd: null, events: [] };
  const lastPrompt = new Map(); // text -> time; some Codex versions log one prompt twice, in two shapes
  forEachLine(file, (line) => {
    const head = line.subarray(0, 120).toString('latin1');
    const isContext = head.includes('"type":"session_meta"') || head.includes('"type":"turn_context"');
    // Codex writes the timestamp first, so lines outside the window are dropped before parsing
    const ts = Date.parse(head.match(/"timestamp":"([^"]+)"/)?.[1] || '');
    if (!isContext && !(ts >= from && ts <= until)) return;

    let r;
    try { r = JSON.parse(line.toString('utf8')); } catch { return; }
    const p = r.payload || {};
    if (r.type === 'session_meta') { if (p.id) s.id = p.id; if (p.cwd) s.cwd = p.cwd; return; }
    if (r.type === 'turn_context') { if (p.cwd) s.cwd = p.cwd; return; }
    const t = Date.parse(r.timestamp);
    if (!(t >= from && t <= until)) return;

    const typed = codexPrompt(r);
    if (typed !== null) {
      const text = typed.trim();
      if (!text || CODEX_NOT_TYPED.test(text)) return;
      if (AUTO_WORK.test(text)) { s.events.push({ t, kind: 'auto' }); return; }
      const prev = lastPrompt.get(text);
      if (prev !== undefined && Math.abs(t - prev) < 5 * 60000) return;
      lastPrompt.set(text, t);
      s.events.push({ t, kind: 'prompt', text, cwd: s.cwd });
      return;
    }
    if (r.type === 'response_item' && CODEX_STEP_ITEMS.has(p.type)) {
      if (p.type === 'message' && p.role !== 'assistant') return;
      const words = p.type === 'message' ? (p.content || []).map(c => c?.text || '').join(' ').slice(0, 2000) : '';
      s.events.push({ t, kind: 'step', words, files: patchFiles(p.input || p.arguments) });
    } else if (r.type === 'event_msg' && CODEX_STEP_EVENTS.has(p.type)) {
      s.events.push({ t, kind: 'step', words: p.type === 'agent_message' ? String(p.message || '').slice(0, 2000) : '', files: [] });
    }
  });
  return s;
}

// The user's typed text: `user_message` events (older Codex) or completed UserMessage items (newer).
// Replayed history in forked threads arrives as response items, not events, so it is not counted twice.
function codexPrompt(r) {
  if (r.type !== 'event_msg') return null;
  const p = r.payload || {};
  if (p.type === 'user_message') return typeof p.message === 'string' ? p.message : null;
  if (p.type === 'item_completed' && p.item?.type === 'UserMessage') {
    return (p.item.content || []).map(c => (typeof c?.text === 'string' ? c.text : '')).join('\n');
  }
  return null;
}

// Files named in an apply_patch body ("*** Update File: path")
function patchFiles(input) {
  const text = typeof input === 'string' ? input : input ? JSON.stringify(input) : '';
  if (!text.includes('*** ')) return [];
  const out = [];
  for (const m of text.matchAll(/\*\*\* (?:Add|Update|Delete) File: ([^\n\\"]+)/g)) out.push(m[1].trim());
  return out;
}
