import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readCacheBreaks(claudeDir) {
  const tmpDir = join(claudeDir, 'tmp');
  if (!existsSync(tmpDir)) return [];

  const breaks = [];

  try {
    const files = readdirSync(tmpDir).filter(f => f.startsWith('cache-break-') && f.endsWith('.diff'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(tmpDir, file), 'utf-8');
        const parsed = parseCacheBreakDiff(raw, file);
        if (parsed) breaks.push(parsed);
      } catch {
        // Skip unreadable files
      }
    }
  } catch {
    return [];
  }

  return breaks.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
}

function parseCacheBreakDiff(content, filename) {
  // Extract timestamp from filename: cache-break-<timestamp>.diff
  const tsMatch = filename.match(/cache-break-(\d+)/);
  const timestamp = tsMatch ? new Date(parseInt(tsMatch[1])).toISOString() : null;

  // Parse the diff content for reasons
  const reasons = [];
  const lines = content.split('\n');

  // Known cache break reason patterns from source code
  const reasonPatterns = [
    { pattern: /system.?prompt.?changed/i, reason: 'System prompt changed' },
    { pattern: /tool.?schema.?changed/i, reason: 'Tool schemas changed' },
    { pattern: /model.?changed/i, reason: 'Model changed' },
    { pattern: /fast.?mode/i, reason: 'Fast mode toggled' },
    { pattern: /cache.?strategy.?changed/i, reason: 'Cache strategy changed' },
    { pattern: /cache.?control.?changed/i, reason: 'Cache control changed' },
    { pattern: /betas?.?changed/i, reason: 'Betas header changed' },
    { pattern: /auto.?mode/i, reason: 'Auto mode toggled' },
    { pattern: /overage/i, reason: 'Overage state changed' },
    { pattern: /microcompact/i, reason: 'Cached microcompact toggled' },
    { pattern: /effort/i, reason: 'Effort value changed' },
    { pattern: /extra.?body/i, reason: 'Extra body params changed' },
    { pattern: /ttl/i, reason: 'TTL expiry' },
    { pattern: /server.?side|evict/i, reason: 'Server-side eviction' },
  ];

  for (const line of lines) {
    for (const { pattern, reason } of reasonPatterns) {
      if (pattern.test(line) && !reasons.includes(reason)) {
        reasons.push(reason);
      }
    }
  }

  // If no specific reason detected, mark as unknown
  if (reasons.length === 0) {
    reasons.push('Unknown / Server-side');
  }

  // Try to extract token counts from the diff
  const prevCacheMatch = content.match(/prev(?:ious)?.*?cache.*?(\d[\d,]*)/i);
  const newCacheMatch = content.match(/new.*?cache.*?(\d[\d,]*)/i);

  return {
    timestamp,
    filename,
    reasons,
    rawContent: content.slice(0, 500), // Keep first 500 chars for debugging
    prevCacheTokens: prevCacheMatch ? parseInt(prevCacheMatch[1].replace(/,/g, '')) : null,
    newCacheTokens: newCacheMatch ? parseInt(newCacheMatch[1].replace(/,/g, '')) : null,
  };
}
