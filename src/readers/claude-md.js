import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function readClaudeMdStack(claudeDir) {
  const home = homedir();
  const stack = [];

  // Global CLAUDE.md
  const globalPath = join(home, '.claude', 'CLAUDE.md');
  if (existsSync(globalPath)) {
    const stat = statSync(globalPath);
    stack.push({
      level: 'global',
      path: globalPath,
      bytes: stat.size,
      tokensEstimate: Math.round(stat.size / 4),
    });
  }

  // Try to find project-level CLAUDE.md by walking up from cwd
  let dir = process.cwd();
  const checked = new Set();
  while (dir && !checked.has(dir)) {
    checked.add(dir);
    const projectMd = join(dir, 'CLAUDE.md');
    if (existsSync(projectMd) && projectMd !== globalPath) {
      const stat = statSync(projectMd);
      stack.push({
        level: 'project',
        path: projectMd,
        bytes: stat.size,
        tokensEstimate: Math.round(stat.size / 4),
      });
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }

  // Check for .claude/settings.json to understand hook/skill overhead
  const settingsPath = join(home, '.claude', 'settings.json');
  let settingsSize = 0;
  if (existsSync(settingsPath)) {
    settingsSize = statSync(settingsPath).size;
  }

  const totalBytes = stack.reduce((sum, f) => sum + f.bytes, 0);
  const totalTokensEstimate = stack.reduce((sum, f) => sum + f.tokensEstimate, 0);

  // Estimate per-message cost at different cache rates (Opus 4.6)
  const cachedCostPerMsg = totalTokensEstimate * 0.0000005;   // $0.50/M cache read
  const uncachedCostPerMsg = totalTokensEstimate * 0.000005;  // $5.00/M standard input

  return {
    files: stack,
    totalBytes,
    totalTokensEstimate,
    settingsBytes: settingsSize,
    costPerMessage: {
      cached: cachedCostPerMsg,
      uncached: uncachedCostPerMsg,
      dailyCached200: cachedCostPerMsg * 200,
      dailyUncached200: uncachedCostPerMsg * 200,
    },
  };
}
