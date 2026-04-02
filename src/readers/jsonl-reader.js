import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

/**
 * Read all JSONL conversation files from Claude Code's data directories.
 * This is the primary data source — same approach as ccusage (12K stars, proven pattern).
 * Claude Code stores full conversation transcripts with token usage per message.
 */
export function readAllJSONL(claudeDir) {
  const projectsDir = join(claudeDir, 'projects');
  const xdgDir = join(homedir(), '.config', 'claude', 'projects'); // XDG fallback for Linux

  const entries = [];

  // Read from primary location
  if (existsSync(projectsDir)) {
    readProjectsDir(projectsDir, entries);
  }

  // XDG fallback (Linux with newer Claude Code)
  if (existsSync(xdgDir) && xdgDir !== projectsDir) {
    readProjectsDir(xdgDir, entries);
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function readProjectsDir(dir, entries) {
  try {
    const projectHashes = readdirSync(dir).filter(f => {
      const full = join(dir, f);
      return statSync(full).isDirectory();
    });

    for (const hash of projectHashes) {
      const projectDir = join(dir, hash);

      // Read top-level JSONL files only (one per session).
      // Subagent files in <session>/subagents/ are NOT read for cost —
      // parent session JSONL already includes subagent token billing.
      // Reading both would double-count (confirmed: $5.7K → $10.8K).
      const jsonlFiles = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      for (const file of jsonlFiles) {
        readJsonlFile(join(projectDir, file), basename(file, '.jsonl'), hash, entries);
      }
    }
  } catch {
    // Directory read failed
  }
}

function readJsonlFile(filePath, sessionId, projectHash, entries) {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const record = JSON.parse(line);

        // Only assistant messages have token usage
        if (record.type !== 'assistant') continue;

        const usage = record.message?.usage;
        if (!usage) continue;

        entries.push({
          sessionId,
          projectHash,
          timestamp: record.timestamp || '',
          model: record.message?.model || 'unknown',
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          cacheCreationTokens: usage.cache_creation_input_tokens || 0,
          cacheReadTokens: usage.cache_read_input_tokens || 0,
          costUSD: record.costUSD || 0,
        });
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // Skip unreadable files
  }
}

/**
 * Aggregate JSONL entries into daily summaries.
 */
export function aggregateDaily(entries) {
  const byDate = {};

  for (const entry of entries) {
    // Extract date from timestamp
    let date;
    if (entry.timestamp && entry.timestamp.length >= 10) {
      date = entry.timestamp.slice(0, 10);
    } else if (entry.timestamp) {
      // Epoch milliseconds
      const ts = parseInt(entry.timestamp);
      if (!isNaN(ts)) {
        date = new Date(ts).toISOString().slice(0, 10);
      }
    }
    if (!date) continue;

    if (!byDate[date]) {
      byDate[date] = {
        date,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        messageCount: 0,
        models: {},
        sessions: new Set(),
      };
    }

    const day = byDate[date];
    day.totalCost += entry.costUSD;
    day.inputTokens += entry.inputTokens;
    day.outputTokens += entry.outputTokens;
    day.cacheCreationTokens += entry.cacheCreationTokens;
    day.cacheReadTokens += entry.cacheReadTokens;
    day.messageCount++;
    day.sessions.add(entry.sessionId);

    // Per-model breakdown
    const model = entry.model;
    if (!day.models[model]) {
      day.models[model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        cost: 0,
        messageCount: 0,
      };
    }
    const m = day.models[model];
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.cacheCreationTokens += entry.cacheCreationTokens;
    m.cacheReadTokens += entry.cacheReadTokens;
    m.cost += entry.costUSD;
    m.messageCount++;
  }

  // Convert sets to counts and sort
  return Object.values(byDate)
    .map(d => ({
      ...d,
      sessionCount: d.sessions.size,
      sessions: undefined,
      cacheOutputRatio: d.outputTokens > 0 ? Math.round(d.cacheReadTokens / d.outputTokens) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Aggregate entries into per-model totals.
 */
export function aggregateByModel(entries) {
  const byModel = {};

  for (const entry of entries) {
    const model = cleanModelName(entry.model);
    if (!byModel[model]) {
      byModel[model] = { inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, cost: 0, messageCount: 0 };
    }
    const m = byModel[model];
    m.inputTokens += entry.inputTokens;
    m.outputTokens += entry.outputTokens;
    m.cacheCreationTokens += entry.cacheCreationTokens;
    m.cacheReadTokens += entry.cacheReadTokens;
    m.cost += entry.costUSD;
    m.messageCount++;
  }

  return byModel;
}

/**
 * Aggregate entries into per-project totals.
 * Uses the project directory hash — resolves to real path where possible.
 */
export function aggregateByProject(entries, claudeDir) {
  const byProject = {};

  for (const entry of entries) {
    const hash = entry.projectHash || 'unknown';
    if (!byProject[hash]) {
      byProject[hash] = {
        hash,
        path: null,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        messageCount: 0,
        sessionCount: 0,
        sessions: new Set(),
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
      };
    }
    const p = byProject[hash];
    p.inputTokens += entry.inputTokens;
    p.outputTokens += entry.outputTokens;
    p.cacheCreationTokens += entry.cacheCreationTokens;
    p.cacheReadTokens += entry.cacheReadTokens;
    p.messageCount++;
    p.sessions.add(entry.sessionId);
    if (entry.timestamp > p.lastSeen) p.lastSeen = entry.timestamp;
    if (entry.timestamp < p.firstSeen) p.firstSeen = entry.timestamp;
  }

  // Decode project paths from directory names
  // Claude Code encodes paths as: C--Users-asmir-Documents-Project-Name
  // Decode: replace leading drive letter pattern, split on -, take last meaningful segments
  for (const proj of Object.values(byProject)) {
    proj.sessionCount = proj.sessions.size;
    delete proj.sessions;

    // Decode the hash (which is the encoded path)
    const decoded = decodeProjectHash(proj.hash);
    proj.path = decoded.path;
    proj.name = decoded.name;
  }

  return Object.values(byProject)
    .sort((a, b) => b.messageCount - a.messageCount);
}

function cleanModelName(name) {
  return (name || 'unknown')
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace(/-20\d{6}$/, '');
}

/**
 * Decode Claude Code's encoded project directory name into a readable path and name.
 * Format: C--Users-asmir-Documents-Obsidian-Architect-OS-01-Projects-My-Project
 * Becomes: C:/Users/asmir/Documents/.../My-Project → name: "My-Project"
 */
function decodeProjectHash(hash) {
  if (!hash || hash === 'unknown') return { path: null, name: 'Unknown' };

  // Replace the drive letter pattern: C-- → C:/
  let decoded = hash.replace(/^([A-Z])--/, '$1:/');

  // The rest uses - as separator, but some folder names have dashes too.
  // Best heuristic: split on known path separators
  // Common patterns: Users, Documents, Desktop, Projects, etc.
  const pathSegments = decoded.split('-');

  // Reconstruct a readable path
  // The encoded format replaces / with - so we need to figure out boundaries
  // Simple approach: reconstruct full path and extract last meaningful project name
  const fullPath = decoded;

  // Extract project name: take the last meaningful segments
  // Skip common prefixes to find the project-specific part
  const skipPrefixes = ['C:', 'Users', 'Documents', 'Desktop', 'Downloads', 'Obsidian', 'repos', 'projects', 'code', 'dev', 'src', 'home'];

  let segments = hash.replace(/^[A-Z]--/, '').split('-');

  // Find where the "interesting" name starts (after common path prefixes)
  let nameStart = 0;
  for (let i = 0; i < segments.length; i++) {
    if (skipPrefixes.some(p => p.toLowerCase() === segments[i].toLowerCase())) {
      nameStart = i + 1;
    } else {
      break;
    }
  }

  // Take the last 2-3 meaningful segments as the project name
  const nameSegments = segments.slice(Math.max(nameStart, segments.length - 3));
  const name = nameSegments.join(' ') || hash.slice(0, 12);

  // Reconstruct a shortened display path
  const path = hash.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');

  return { path, name };
}
