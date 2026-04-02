import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export function readClaudeMdStack(claudeDir) {
  const home = homedir();
  const stack = [];

  // Global CLAUDE.md — detailed section analysis
  const globalPath = join(home, '.claude', 'CLAUDE.md');
  let globalSections = [];
  if (existsSync(globalPath)) {
    const stat = statSync(globalPath);
    const content = readFileSync(globalPath, 'utf-8');
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Parse sections (## headings)
    let currentSection = { name: 'Header', lines: 0, bytes: 0 };
    const sections = [];
    for (const line of lines) {
      if (line.match(/^##\s+/)) {
        if (currentSection.lines > 0) sections.push(currentSection);
        currentSection = { name: line.replace(/^#+\s*/, '').trim(), lines: 0, bytes: 0 };
      }
      currentSection.lines++;
      currentSection.bytes += Buffer.byteLength(line + '\n', 'utf-8');
    }
    if (currentSection.lines > 0) sections.push(currentSection);

    // Add token estimates and sort by size
    globalSections = sections
      .map(s => ({ ...s, tokens: Math.round(s.bytes / 4) }))
      .sort((a, b) => b.bytes - a.bytes);

    stack.push({
      level: 'global',
      path: globalPath,
      bytes: stat.size,
      tokensEstimate: Math.round(stat.size / 4),
      lineCount,
      sectionCount: sections.length,
      sections: globalSections,
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
    globalSections,
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
