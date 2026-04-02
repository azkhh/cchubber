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
      const jsonlFiles = readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const sessionId = basename(file, '.jsonl');
        const filePath = join(projectDir, file);

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
                projectHash: hash,
                timestamp: record.timestamp || '',
                model: record.message?.model || 'unknown',
                inputTokens: usage.input_tokens || 0,
                outputTokens: usage.output_tokens || 0,
                cacheCreationTokens: usage.cache_creation_input_tokens || 0,
                cacheReadTokens: usage.cache_read_input_tokens || 0,
                costUSD: record.costUSD || 0, // Pre-calculated by Claude Code
              });
            } catch {
              // Skip malformed lines
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  } catch {
    // Directory read failed
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

function cleanModelName(name) {
  return (name || 'unknown')
    .replace('claude-', '')
    .replace(/-\d{8}$/, '')
    .replace(/-20\d{6}$/, '');
}
