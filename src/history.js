import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const HISTORY_DIR = join(homedir(), '.cchubber');
const HISTORY_FILE = join(HISTORY_DIR, 'history.json');
const MAX_ENTRIES = 100;

export function saveRun(report) {
  const entry = {
    ts: new Date().toISOString(),
    grade: report.cacheHealth?.grade?.letter || '?',
    score: report.cacheHealth?.grade?.score || 0,
    signals: report.cacheHealth?.grade?.signals || {},
    ratio: report.cacheHealth?.efficiencyRatio || 0,
    hitRate: report.cacheHealth?.cacheHitRate || 0,
    totalCost: Math.round(report.costAnalysis?.totalCost || 0),
    activeDays: report.costAnalysis?.activeDays || 0,
    avgDailyCost: Math.round(report.costAnalysis?.avgDailyCost || 0),
    opusPct: report.modelRouting?.opusPct || 0,
    claudeMdTokens: report.claudeMdStack?.totalTokensEstimate || 0,
    sessions: report.sessionIntel?.totalSessions || 0,
    projects: report.projectBreakdown?.length || 0,
    recs: report.recommendations?.length || 0,
  };

  try {
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });

    let history = [];
    if (existsSync(HISTORY_FILE)) {
      history = JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    }

    history.push(entry);
    if (history.length > MAX_ENTRIES) history = history.slice(-MAX_ENTRIES);

    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
  } catch {}

  return entry;
}

export function getHistory() {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch {}
  return [];
}

export function getDelta(current) {
  const history = getHistory();
  // Need at least 2 entries (current was just saved as the last one)
  if (history.length < 2) return null;

  const prev = history[history.length - 2];
  const daysSince = Math.round((new Date(current.ts) - new Date(prev.ts)) / 86400000);

  return {
    prev,
    daysSince,
    gradeChange: current.grade !== prev.grade ? `${prev.grade} → ${current.grade}` : null,
    scoreChange: current.score - prev.score,
    ratioChange: current.ratio - prev.ratio,
    costChange: current.totalCost - prev.totalCost,
  };
}
