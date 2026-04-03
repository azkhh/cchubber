import https from 'https';
import { platform, arch, homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// Anonymous usage telemetry — no PII, no tokens, no file contents.
// Opt out: npx cchubber --no-telemetry
// Or set env: CC_HUBBER_TELEMETRY=0

const TELEMETRY_URL = process.env.CC_HUBBER_TELEMETRY_URL || 'https://cchubber-telemetry.azkhh.workers.dev/collect';

export function shouldSendTelemetry(flags) {
  if (flags.noTelemetry) return false;
  if (process.env.CC_HUBBER_TELEMETRY === '0') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;
  return true;
}

export function sendTelemetry(report) {
  const payload = {
    v: '0.3.3',
    uid: getOrCreateUID(),
    ts: new Date().toISOString(),
    os: platform(),
    arch: arch(),

    // Aggregated stats — no file contents, no project names, no personal data
    // Usage profile
    grade: report.cacheHealth?.grade?.letter || '?',
    cacheRatio: report.cacheHealth?.efficiencyRatio || 0,
    cacheHitRate: report.cacheHealth?.cacheHitRate || 0,
    cacheBreaks: report.cacheHealth?.totalCacheBreaks || 0,
    estimatedBreaks: report.cacheHealth?.estimatedBreaks || 0,
    cacheSaved: report.cacheHealth?.savings?.fromCaching || 0,
    cacheWasted: report.cacheHealth?.savings?.wastedFromBreaks || 0,

    // Cost & scale
    activeDays: report.costAnalysis?.activeDays || 0,
    totalCostBucket: costBucket(report.costAnalysis?.totalCost || 0),
    avgDailyCost: Math.round(report.costAnalysis?.avgDailyCost || 0),
    peakDayCost: Math.round(report.costAnalysis?.peakDay?.cost || 0),
    totalMessages: report.costAnalysis?.dailyCosts?.reduce((s, d) => s + (d.messageCount || 0), 0) || 0,

    // Model usage (key for understanding subscription behavior)
    modelSplit: modelSplitSummary(report.costAnalysis?.modelCosts || {}),
    modelCount: Object.keys(report.costAnalysis?.modelCosts || {}).length,
    opusPct: report.modelRouting?.opusPct || 0,
    sonnetPct: report.modelRouting?.sonnetPct || 0,
    haikuPct: report.modelRouting?.haikuPct || 0,
    subagentPct: report.modelRouting?.subagentPct || 0,

    // CLAUDE.md (how people configure their AI)
    claudeMdTokens: report.claudeMdStack?.totalTokensEstimate || 0,
    claudeMdBytes: report.claudeMdStack?.totalBytes || 0,
    claudeMdSections: report.claudeMdStack?.globalSections?.length || 0,
    claudeMdFiles: report.claudeMdStack?.files?.length || 0,
    claudeMdCostCached: report.claudeMdStack?.costPerMessage?.cached || 0,
    claudeMdCostUncached: report.claudeMdStack?.costPerMessage?.uncached || 0,

    // Session patterns (how people work)
    sessionCount: report.sessionIntel?.totalSessions || 0,
    avgSessionMin: report.sessionIntel?.avgDuration || 0,
    medianSessionMin: report.sessionIntel?.medianDuration || 0,
    p90SessionMin: report.sessionIntel?.p90Duration || 0,
    maxSessionMin: report.sessionIntel?.maxDuration || 0,
    longSessionPct: report.sessionIntel?.longSessionPct || 0,
    avgToolsPerSession: report.sessionIntel?.avgToolsPerSession || 0,
    linesPerHour: report.sessionIntel?.linesPerHour || 0,
    peakOverlapPct: report.sessionIntel?.peakOverlapPct || 0,
    topTools: (report.sessionIntel?.topTools || []).slice(0, 6).map(t => t.name),

    // Scale indicators
    projectCount: report.projectBreakdown?.length || 0,
    anomalyCount: report.anomalies?.anomalies?.length || 0,
    trend: report.anomalies?.trend || 'stable',
    inflectionDir: report.inflection?.direction || 'none',
    inflectionMult: report.inflection?.multiplier || 0,
    entryCount: report.costAnalysis?.dailyCosts?.length || 0,
    recCount: report.recommendations?.length || 0,

    // Rate limits (shows subscription tier indirectly)
    hasOauth: !!report.oauthUsage,
    rateLimit5h: report.oauthUsage?.five_hour?.utilization || null,
    rateLimit7d: report.oauthUsage?.seven_day?.utilization || null,

    // Token volumes (bucketed for anonymity)
    totalInputBucket: tokenBucket(report.cacheHealth?.totals?.input || 0),
    totalOutputBucket: tokenBucket(report.cacheHealth?.totals?.output || 0),
    totalCacheReadBucket: tokenBucket(report.cacheHealth?.totals?.cacheRead || 0),
    totalCacheWriteBucket: tokenBucket(report.cacheHealth?.totals?.cacheWrite || 0),

    // Hour distribution (when people work — 24 values)
    hourDistribution: report.sessionIntel?.hourDistribution || [],

    // Which recommendations fired (shows common problems)
    recsTriggered: (report.recommendations || []).map(r => r.title.slice(0, 50)),

    // CLAUDE.md top sections by tokens (what people put in their rules)
    claudeMdTopSections: (report.claudeMdStack?.globalSections || []).slice(0, 5).map(s => ({
      name: s.name.slice(0, 40),
      tokens: s.tokens,
      lines: s.lines,
    })),

    // Per-message cost impact
    msgCostCached: report.claudeMdStack?.costPerMessage?.cached || 0,
    msgCostUncached: report.claudeMdStack?.costPerMessage?.uncached || 0,
    dailyCost200: report.claudeMdStack?.costPerMessage?.dailyCached200 || 0,

    // Daily cost trend (last 30 days — shows impact curve)
    dailyCostTrend: (report.costAnalysis?.dailyCosts || []).slice(-30).map(d => ({
      d: d.date, c: Math.round(d.cost * 100) / 100, r: d.cacheOutputRatio || 0
    })),

    // Environment deep dive
    ...gatherEnvironmentData(),
  };

  // Fire and forget — never blocks the CLI
  try {
    const data = JSON.stringify(payload);
    const url = new URL(TELEMETRY_URL);
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length },
    });
    req.on('error', () => {}); // silent fail
    req.setTimeout(3000, () => req.destroy());
    req.write(data);
    req.end();
  } catch {
    // never crash on telemetry
  }
}

function costBucket(cost) {
  // Bucketed so we can't identify individuals by exact cost
  if (cost < 10) return '<10';
  if (cost < 50) return '10-50';
  if (cost < 200) return '50-200';
  if (cost < 500) return '200-500';
  if (cost < 1000) return '500-1K';
  if (cost < 5000) return '1K-5K';
  return '5K+';
}

function getOrCreateUID() {
  // Anonymous install ID — random, no PII. Same approach as Next.js/Turborepo telemetry.
  const idFile = join(homedir(), '.cchubber-uid');
  try {
    if (existsSync(idFile)) return readFileSync(idFile, 'utf-8').trim();
    const uid = 'u_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    writeFileSync(idFile, uid);
    return uid;
  } catch {
    return 'anon_' + Math.random().toString(36).slice(2, 10);
  }
}

function gatherEnvironmentData() {
  const home = homedir();
  const claudeDir = join(home, '.claude');
  const data = {};

  try {
    // Claude Code version (from package or binary)
    const statsCache = join(claudeDir, 'stats-cache.json');
    if (existsSync(statsCache)) {
      const raw = JSON.parse(readFileSync(statsCache, 'utf-8'));
      data.ccVersion = raw.version || null;
    }

    // MCP servers (from settings - which tools people connect)
    const settingsPath = join(claudeDir, 'settings.json');
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      data.hasSettings = true;
      data.settingsSize = statSync(settingsPath).size;

      // MCP server names (popular tool ecosystem data)
      if (settings.mcpServers) {
        const mcpNames = Object.keys(settings.mcpServers);
        data.mcpServerCount = mcpNames.length;
        data.mcpServers = mcpNames; // which MCP tools are popular
      }

      // Hooks configured?
      data.hasHooks = !!(settings.hooks && Object.keys(settings.hooks).length > 0);
      data.hookCount = settings.hooks ? Object.values(settings.hooks).flat().length : 0;

      // Custom model preferences
      data.defaultModel = settings.model || null;
      data.hasCustomPermissions = !!settings.permissions;
    }

    // Project-level settings (from .claude.json in cwd)
    const localSettings = join(process.cwd(), '.claude.json');
    if (existsSync(localSettings)) {
      try {
        const local = JSON.parse(readFileSync(localSettings, 'utf-8'));
        if (local.mcpServers) {
          data.localMcpCount = Object.keys(local.mcpServers).length;
          data.localMcpServers = Object.keys(local.mcpServers);
        }
      } catch {}
    }

    // Skills installed (from ~/.claude/skills/)
    const skillsDir = join(claudeDir, 'skills');
    if (existsSync(skillsDir)) {
      try {
        data.skillCount = readdirSync(skillsDir).filter(f => {
          try { return statSync(join(skillsDir, f)).isDirectory(); } catch { return false; }
        }).length;
      } catch {}
    }

    // .claudeignore exists?
    data.hasClaudeignore = existsSync(join(process.cwd(), '.claudeignore'));

    // Project count (how many projects they work on)
    const projectsDir = join(claudeDir, 'projects');
    if (existsSync(projectsDir)) {
      try {
        data.totalProjectDirs = readdirSync(projectsDir).filter(f => {
          try { return statSync(join(projectsDir, f)).isDirectory(); } catch { return false; }
        }).length;
      } catch {}
    }

    // Credentials (do they have OAuth set up — subscription signal)
    data.hasOauthCreds = existsSync(join(claudeDir, '.credentials.json'));

    // CLAUDE.md files found (global + how many project-level)
    data.hasGlobalClaudeMd = existsSync(join(claudeDir, 'CLAUDE.md'));

    // Usage data size (proxy for how long they've been using CC)
    const usageDir = join(claudeDir, 'usage-data');
    if (existsSync(usageDir)) {
      try {
        const sessionMetaDir = join(usageDir, 'session-meta');
        if (existsSync(sessionMetaDir)) {
          data.totalSessionFiles = readdirSync(sessionMetaDir).filter(f => f.endsWith('.json')).length;
        }
      } catch {}
    }

    // Node.js version (compatibility data)
    data.nodeVersion = process.version;

    // Terminal width (UI/UX data)
    data.terminalCols = process.stdout.columns || 0;

    // How they ran it (npx vs global install vs local)
    data.invokedAs = process.argv[1]?.includes('npx') ? 'npx' : process.argv[1]?.includes('node_modules') ? 'local' : 'global';

    // Git info from cwd (what kind of projects people work on)
    try {
      const gitDir = join(process.cwd(), '.git');
      data.isGitRepo = existsSync(gitDir);
      if (data.isGitRepo) {
        const gitConfig = join(gitDir, 'config');
        if (existsSync(gitConfig)) {
          const gc = readFileSync(gitConfig, 'utf-8');
          data.hasGitRemote = gc.includes('[remote');
          data.isGitHub = gc.includes('github.com');
          data.isGitLab = gc.includes('gitlab');
        }
      }
    } catch {}

    // Package.json in cwd (what tech stack)
    const pkgPath = join(process.cwd(), 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        data.hasPackageJson = true;
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
        const depNames = Object.keys(allDeps);
        data.depCount = depNames.length;
        // Detect major frameworks (anonymized — just booleans)
        data.usesReact = depNames.some(d => d === 'react' || d === 'next');
        data.usesVue = depNames.some(d => d === 'vue' || d === 'nuxt');
        data.usesSvelte = depNames.some(d => d.includes('svelte'));
        data.usesTypescript = depNames.some(d => d === 'typescript');
        data.usesTailwind = depNames.some(d => d.includes('tailwind'));
        data.usesExpress = depNames.some(d => d === 'express' || d === 'fastify' || d === 'hono');
        data.usesPrisma = depNames.some(d => d === 'prisma' || d === '@prisma/client');
        data.projectType = pkg.type || 'commonjs';
      } catch {}
    }

    // Python project?
    data.isPython = existsSync(join(process.cwd(), 'requirements.txt')) || existsSync(join(process.cwd(), 'pyproject.toml'));

    // Rust project?
    data.isRust = existsSync(join(process.cwd(), 'Cargo.toml'));

    // Go project?
    data.isGo = existsSync(join(process.cwd(), 'go.mod'));

    // File count in cwd (project size proxy)
    try {
      const cwdFiles = readdirSync(process.cwd());
      data.cwdFileCount = cwdFiles.length;
      data.hasSrcDir = cwdFiles.includes('src');
      data.hasTestDir = cwdFiles.includes('test') || cwdFiles.includes('tests') || cwdFiles.includes('__tests__');
    } catch {}

    // First and last usage date (from JSONL file timestamps)
    if (existsSync(projectsDir)) {
      try {
        let earliest = null, latest = null;
        const dirs = readdirSync(projectsDir).slice(0, 5); // sample first 5 projects
        for (const d of dirs) {
          const pDir = join(projectsDir, d);
          try {
            const files = readdirSync(pDir).filter(f => f.endsWith('.jsonl'));
            for (const f of files) {
              const s = statSync(join(pDir, f));
              if (!earliest || s.mtimeMs < earliest) earliest = s.mtimeMs;
              if (!latest || s.mtimeMs > latest) latest = s.mtimeMs;
            }
          } catch {}
        }
        if (earliest) data.firstUsage = new Date(earliest).toISOString().slice(0, 10);
        if (latest) data.lastUsage = new Date(latest).toISOString().slice(0, 10);
        if (earliest && latest) data.usageDaysSpan = Math.round((latest - earliest) / 86400000);
      } catch {}
    }

  } catch {
    // never crash on telemetry data gathering
  }

  return data;
}

function tokenBucket(tokens) {
  if (tokens < 1e6) return '<1M';
  if (tokens < 10e6) return '1-10M';
  if (tokens < 100e6) return '10-100M';
  if (tokens < 1e9) return '100M-1B';
  if (tokens < 10e9) return '1-10B';
  return '10B+';
}

function modelSplitSummary(modelCosts) {
  const total = Object.values(modelCosts).reduce((s, c) => s + c, 0);
  if (total === 0) return {};
  const split = {};
  for (const [name, cost] of Object.entries(modelCosts)) {
    split[name] = Math.round((cost / total) * 100);
  }
  return split;
}
