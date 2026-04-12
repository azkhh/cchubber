import https from 'https';
import { platform, arch, homedir, cpus, totalmem, freemem } from 'os';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { execSync as rawExec } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')).version;

// Suppress stderr output on Windows (prevents "system cannot find path" spam)
function execSync(cmd, opts = {}) {
  return rawExec(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

// Anonymous usage telemetry — no PII, no tokens, no file contents.
// Opt out: npx cchubber --no-telemetry
// Or set env: CC_HUBBER_TELEMETRY=0

const TELEMETRY_URL = process.env.CC_HUBBER_TELEMETRY_URL || 'https://cchubber-telemetry.asmirkhan087.workers.dev/collect';

export function shouldSendTelemetry(flags) {
  if (flags.noTelemetry) return false;
  if (process.env.CC_HUBBER_TELEMETRY === '0') return false;
  if (process.env.DO_NOT_TRACK === '1') return false;

  // Throttle: once per 24 hours per machine
  const stampFile = join(homedir(), '.cchubber-last-telemetry');
  try {
    if (existsSync(stampFile)) {
      const last = parseInt(readFileSync(stampFile, 'utf-8').trim());
      if (Date.now() - last < 86400000) return false; // <24h since last send
    }
  } catch {}

  return true;
}

function markTelemetrySent() {
  try { writeFileSync(join(homedir(), '.cchubber-last-telemetry'), String(Date.now())); } catch {}
}

export function sendTelemetry(report) {
  const payload = {
    v: PKG_VERSION,
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

  // Returns a promise that resolves when the request completes (or times out)
  // CLI must await this before exiting, otherwise the process kills the request
  return new Promise((resolve) => {
    try {
      const data = JSON.stringify(payload);
      const url = new URL(TELEMETRY_URL);
      const req = https.request({
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        res.resume(); // drain response
        res.on('end', () => { markTelemetrySent(); resolve(); });
      });
      req.on('error', () => resolve()); // silent fail, still resolve
      req.setTimeout(4000, () => { req.destroy(); resolve(); });
      req.write(data);
      req.end();
    } catch {
      resolve(); // never block on telemetry failure
    }
  });
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

    // Editor/IDE detection (from env vars)
    data.editor = process.env.TERM_PROGRAM || process.env.VSCODE_PID ? 'vscode' : process.env.CURSOR_TRACE ? 'cursor' : process.env.JETBRAINS_IDE ? 'jetbrains' : process.env.WINDSURF_PID ? 'windsurf' : 'terminal';
    data.shell = process.env.SHELL?.split('/').pop() || (process.env.PSModulePath ? 'powershell' : 'unknown');
    data.terminalRows = process.stdout.rows || 0;
    data.isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);

    // Package manager (which lock file)
    data.packageManager = existsSync(join(process.cwd(), 'bun.lockb')) ? 'bun'
      : existsSync(join(process.cwd(), 'pnpm-lock.yaml')) ? 'pnpm'
      : existsSync(join(process.cwd(), 'yarn.lock')) ? 'yarn'
      : existsSync(join(process.cwd(), 'package-lock.json')) ? 'npm' : 'none';

    // Monorepo detection
    data.isMonorepo = existsSync(join(process.cwd(), 'lerna.json'))
      || existsSync(join(process.cwd(), 'nx.json'))
      || existsSync(join(process.cwd(), 'turbo.json'))
      || existsSync(join(process.cwd(), 'pnpm-workspace.yaml'));

    // Infra signals (just file existence, never contents)
    data.hasDocker = existsSync(join(process.cwd(), 'Dockerfile')) || existsSync(join(process.cwd(), 'docker-compose.yml'));
    data.hasCI = existsSync(join(process.cwd(), '.github/workflows')) || existsSync(join(process.cwd(), '.gitlab-ci.yml'));
    data.deployment = existsSync(join(process.cwd(), 'vercel.json')) ? 'vercel'
      : existsSync(join(process.cwd(), 'netlify.toml')) ? 'netlify'
      : existsSync(join(process.cwd(), 'fly.toml')) ? 'fly'
      : existsSync(join(process.cwd(), 'railway.json')) ? 'railway'
      : existsSync(join(process.cwd(), 'amplify.yml')) ? 'aws' : 'unknown';

    // Testing & quality
    data.hasTests = existsSync(join(process.cwd(), 'jest.config.js')) || existsSync(join(process.cwd(), 'vitest.config.ts')) || existsSync(join(process.cwd(), 'vitest.config.js')) || existsSync(join(process.cwd(), '.mocharc.yml'));
    data.hasLinting = existsSync(join(process.cwd(), '.eslintrc.json')) || existsSync(join(process.cwd(), '.eslintrc.js')) || existsSync(join(process.cwd(), 'biome.json')) || existsSync(join(process.cwd(), '.prettierrc'));
    data.hasEnvFile = existsSync(join(process.cwd(), '.env')) || existsSync(join(process.cwd(), '.env.local'));
    data.hasReadme = existsSync(join(process.cwd(), 'README.md'));
    data.hasLicense = existsSync(join(process.cwd(), 'LICENSE')) || existsSync(join(process.cwd(), 'LICENSE.md'));

    // Bundler
    data.bundler = existsSync(join(process.cwd(), 'vite.config.ts')) || existsSync(join(process.cwd(), 'vite.config.js')) ? 'vite'
      : existsSync(join(process.cwd(), 'webpack.config.js')) ? 'webpack'
      : existsSync(join(process.cwd(), 'next.config.js')) || existsSync(join(process.cwd(), 'next.config.ts')) ? 'next'
      : existsSync(join(process.cwd(), 'esbuild.config.js')) ? 'esbuild' : 'unknown';

    // API/backend signals
    data.hasGraphQL = existsSync(join(process.cwd(), 'schema.graphql')) || existsSync(join(process.cwd(), 'schema.gql'));
    data.hasOpenAPI = existsSync(join(process.cwd(), 'openapi.yaml')) || existsSync(join(process.cwd(), 'swagger.json'));

    // System specs
    data.cpuCores = cpus().length;
    data.ramGB = Math.round(totalmem() / 1073741824);
    data.freeRamGB = Math.round(freemem() / 1073741824);
    data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    data.locale = process.env.LANG || process.env.LC_ALL || Intl.DateTimeFormat().resolvedOptions().locale;
    data.runTimeMs = Math.round(process.uptime() * 1000);

    // Git project signals (no URLs, no names — just metrics)
    try {
      data.gitCommitCount = parseInt(execSync('git rev-list --count HEAD 2>/dev/null', {}).trim()) || 0;
      data.gitBranchCount = parseInt(execSync('git branch --list 2>/dev/null | wc -l', {}).trim()) || 0;
      data.gitContributors = parseInt(execSync('git shortlog -sn --all 2>/dev/null | wc -l', {}).trim()) || 0;
      const lastCommit = execSync('git log -1 --format=%ct 2>/dev/null', {}).trim();
      data.daysSinceLastCommit = lastCommit ? Math.round((Date.now()/1000 - parseInt(lastCommit)) / 86400) : null;
      data.gitHost = (() => {
        try {
          const url = execSync('git remote get-url origin 2>/dev/null', {}).trim();
          if (url.includes('github.com')) return 'github';
          if (url.includes('gitlab')) return 'gitlab';
          if (url.includes('bitbucket')) return 'bitbucket';
          if (url.includes('codeberg')) return 'codeberg';
          return 'other';
        } catch { return 'none'; }
      })();
    } catch {}

    // File type distribution (language signals — count only, no names)
    try {
      const countExt = (ext) => {
        try { return parseInt(execSync(`find . -maxdepth 4 -name "*.${ext}" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" 2>/dev/null | wc -l`, {}).trim()) || 0; } catch { return 0; }
      };
      data.filesByType = {
        js: countExt('js'), ts: countExt('ts'), tsx: countExt('tsx'), jsx: countExt('jsx'),
        py: countExt('py'), go: countExt('go'), rs: countExt('rs'), java: countExt('java'),
        rb: countExt('rb'), php: countExt('php'), swift: countExt('swift'), kt: countExt('kt'),
        md: countExt('md'), json: countExt('json'), yaml: countExt('yaml') || countExt('yml'),
        css: countExt('css'), html: countExt('html'), sql: countExt('sql'),
      };
    } catch {}

    // JSONL total size (how much CC data they have)
    try {
      const totalJSONLSize = parseInt(execSync(`find "${join(claudeDir, 'projects')}" -name "*.jsonl" -not -path "*/subagents/*" 2>/dev/null -exec stat --format="%s" {} + 2>/dev/null | awk '{s+=$1}END{print s}'`, {}).trim()) || 0;
      data.jsonlTotalMB = Math.round(totalJSONLSize / 1048576);
    } catch { data.jsonlTotalMB = 0; }

    // Weekday vs weekend usage pattern
    try {
      const dailyCosts = report.costAnalysis?.dailyCosts || [];
      let weekdayCount = 0, weekendCount = 0;
      for (const d of dailyCosts) {
        const day = new Date(d.date + 'T00:00:00').getDay();
        if (day === 0 || day === 6) weekendCount++;
        else weekdayCount++;
      }
      data.weekdayDays = weekdayCount;
      data.weekendDays = weekendCount;
    } catch {}

    // Average tokens per message (prompt verbosity)
    try {
      const totalInput = report.cacheHealth?.totals?.input || 0;
      const totalOutput = report.cacheHealth?.totals?.output || 0;
      const totalMsgs = report.costAnalysis?.dailyCosts?.reduce((s, d) => s + (d.messageCount || 0), 0) || 1;
      data.avgInputPerMsg = Math.round(totalInput / totalMsgs);
      data.avgOutputPerMsg = Math.round(totalOutput / totalMsgs);
    } catch {}

    // Memory/context files
    data.hasMemory = existsSync(join(claudeDir, 'memory'));
    data.hasCustomCommands = existsSync(join(claudeDir, 'commands'));

    // Productivity tools
    data.usesObsidian = existsSync(join(home, '.obsidian'))
      || existsSync(join(home, 'Documents', 'Obsidian'))
      || existsSync(join(home, 'Obsidian'));
    data.usesCopilot = existsSync(join(home, '.config', 'github-copilot')) || existsSync(join(home, '.copilot'));
    data.usesCursor = existsSync(join(home, '.cursor'));
    data.usesCline = existsSync(join(home, '.cline'));
    data.usesWindsurf = existsSync(join(home, '.windsurf'));
    data.usesAider = existsSync(join(home, '.aider'));
    data.usesContinue = existsSync(join(home, '.continue'));
    data.usesTabnine = existsSync(join(home, '.tabnine'));
    data.usesCody = existsSync(join(home, '.sourcegraph'));
    data.usesCodex = existsSync(join(home, '.codex'));
    data.usesGeminiCLI = existsSync(join(home, '.gemini'));
    data.usesAmazonQ = existsSync(join(home, '.aws', 'amazonq'));
    data.usesAntigravity = existsSync(join(home, '.antigravity'));

    // Customization depth
    data.customizationScore = (
      (data.hasSettings ? 1 : 0) + (data.hasGlobalClaudeMd ? 1 : 0) +
      (data.hasHooks ? 2 : 0) + (data.skillCount > 0 ? 2 : 0) +
      (data.mcpServerCount > 2 ? 2 : 0) + (data.claudeMdTokens > 5000 ? 1 : 0) +
      (data.claudeMdTokens > 15000 ? 2 : 0) + (data.hasMemory ? 1 : 0) +
      (data.hasCustomCommands ? 1 : 0)
    );

    // Work patterns
    const hours = report.sessionIntel?.hourDistribution || [];
    const lateNightMsgs = (hours[22]||0) + (hours[23]||0) + (hours[0]||0) + (hours[1]||0) + (hours[2]||0) + (hours[3]||0);
    const totalMsgsByHour = hours.reduce((s,h) => s+h, 0);
    data.lateNightPct = totalMsgsByHour > 0 ? Math.round(lateNightMsgs / totalMsgsByHour * 100) : 0;
    data.peakHour = hours.indexOf(Math.max(...hours));

    // Project structure
    data.hasTodoFile = existsSync(join(process.cwd(), 'TODO.md')) || existsSync(join(process.cwd(), 'TASKS.md'));
    data.hasPlanFile = existsSync(join(process.cwd(), 'plan.md')) || existsSync(join(process.cwd(), 'ROADMAP.md'));
    data.hasChangelog = existsSync(join(process.cwd(), 'CHANGELOG.md'));
    data.hasContributing = existsSync(join(process.cwd(), 'CONTRIBUTING.md'));

    // Session intensity
    data.maxSessionHours = Math.round((report.sessionIntel?.maxDuration || 0) / 60);
    data.avgMessagesPerSession = report.sessionIntel?.avgMessagesPerSession || 0;
    data.sessionsOver2h = (report.sessionIntel?.available)
      ? Math.round((report.sessionIntel?.longSessionPct || 0) * (report.sessionIntel?.totalSessions || 0) / 100) : 0;
    data.activeProjects = report.projectBreakdown?.filter(p => p.sessionCount > 0).length || 0;

    // AI SDK detection (from package.json deps)
    if (existsSync(join(process.cwd(), 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
        const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
        data.usesAnthropicSDK = deps.some(d => d.includes('anthropic'));
        data.usesOpenAISDK = deps.includes('openai');
        data.usesLangChain = deps.some(d => d.includes('langchain'));
        data.usesVercelAI = deps.includes('ai');
        data.usesLlamaIndex = deps.some(d => d.includes('llamaindex'));
        data.usesGoogleAI = deps.some(d => d.includes('generative-ai'));
        data.usesSupabase = deps.some(d => d.includes('supabase'));
        data.usesFirebase = deps.some(d => d.includes('firebase'));
        data.usesStripe = deps.includes('stripe');
        data.usesAuth = deps.some(d => d.includes('next-auth') || d.includes('clerk') || d.includes('lucia') || d.includes('auth0'));
        data.usesORM = deps.some(d => d.includes('prisma') || d.includes('drizzle') || d.includes('typeorm') || d.includes('sequelize') || d.includes('mongoose'));
        data.usesRedis = deps.some(d => d.includes('redis') || d.includes('ioredis'));
        data.usesQueue = deps.some(d => d.includes('bullmq') || d.includes('bee-queue'));
        data.usesWebSocket = deps.some(d => d.includes('socket.io') || d.includes('ws'));
        data.usesZod = deps.includes('zod');
        data.usesTRPC = deps.some(d => d.includes('trpc'));
        data.usesGraphQL = deps.some(d => d.includes('graphql') || d.includes('apollo'));
      } catch {}
    }

    // OS version
    try { data.osVersion = execSync('ver 2>/dev/null || uname -r 2>/dev/null', {}).trim().slice(0,50); } catch {}

    // Workspace scale
    try {
      const projDir = join(claudeDir, 'projects');
      if (existsSync(projDir)) {
        const allJsonl = readdirSync(projDir).reduce((count, d) => {
          try { return count + readdirSync(join(projDir, d)).filter(f => f.endsWith('.jsonl')).length; } catch { return count; }
        }, 0);
        data.totalConversations = allJsonl;
      }
    } catch {}

    // Largest project (by messages, no name)
    try {
      const sorted = (report.projectBreakdown || []).sort((a, b) => b.messageCount - a.messageCount);
      if (sorted[0]) {
        data.largestProjectMsgs = sorted[0].messageCount;
        data.largestProjectSessions = sorted[0].sessionCount;
      }
      // Newest project (last seen)
      const bySeen = (report.projectBreakdown || []).filter(p => p.lastSeen).sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
      if (bySeen[0]) data.newestProjectAge = bySeen[0].lastSeen?.slice(0, 10);
    } catch {}

    // Keybindings & preferences
    data.hasKeybindings = existsSync(join(claudeDir, 'keybindings.json'));
    data.hasTheme = existsSync(join(process.cwd(), '.vscode', 'settings.json'));

    // Auth method
    try {
      if (existsSync(join(claudeDir, '.credentials.json'))) {
        const creds = JSON.parse(readFileSync(join(claudeDir, '.credentials.json'), 'utf-8'));
        data.authMethod = creds.apiKey ? 'apikey' : creds.oauthToken ? 'oauth' : 'unknown';
      }
    } catch { data.authMethod = 'none'; }

    // Cost per project type (bucketed, no names)
    try {
      const projs = report.projectBreakdown || [];
      data.projectCostDistribution = projs.slice(0, 5).map(p => ({
        msgs: p.messageCount,
        sessions: p.sessionCount,
        output: tokenBucket(p.outputTokens || 0),
        cacheRead: tokenBucket(p.cacheReadTokens || 0),
      }));
    } catch {}

    // Acceptance/productivity signals (how effectively they use CC)
    try {
      const totalOutput = report.cacheHealth?.totals?.output || 0;
      const totalInput = report.cacheHealth?.totals?.input || 0;
      const totalCacheRead = report.cacheHealth?.totals?.cacheRead || 0;
      data.outputToInputRatio = totalInput > 0 ? Math.round(totalOutput / totalInput * 100) / 100 : 0;
      data.cacheToTotalRatio = (totalCacheRead + totalInput) > 0 ? Math.round(totalCacheRead / (totalCacheRead + totalInput) * 100) : 0;
    } catch {}

    // Cost trajectory (are they spending more or less over time)
    try {
      const daily = report.costAnalysis?.dailyCosts || [];
      if (daily.length >= 14) {
        const first7 = daily.slice(0, 7).reduce((s, d) => s + d.cost, 0) / 7;
        const last7 = daily.slice(-7).reduce((s, d) => s + d.cost, 0) / 7;
        data.costTrajectory = first7 > 0 ? Math.round((last7 / first7) * 100) / 100 : 0; // >1 = increasing, <1 = decreasing
      }
    } catch {}

    // Session regularity (how consistently they use CC)
    try {
      const daily = report.costAnalysis?.dailyCosts || [];
      const activeDates = daily.filter(d => d.cost > 0).map(d => d.date);
      if (activeDates.length >= 2) {
        // Calculate gaps between active days
        let totalGap = 0;
        for (let i = 1; i < activeDates.length; i++) {
          const gap = (new Date(activeDates[i]) - new Date(activeDates[i-1])) / 86400000;
          totalGap += gap;
        }
        data.avgDaysBetweenSessions = Math.round(totalGap / (activeDates.length - 1) * 10) / 10;
      }
    } catch {}

    // Tool diversity (how many different tool types they use)
    try {
      const tools = report.sessionIntel?.topTools || [];
      data.uniqueToolCount = tools.length;
      data.usesReadTool = tools.some(t => t.name === 'Read');
      data.usesBashTool = tools.some(t => t.name === 'Bash');
      data.usesEditTool = tools.some(t => t.name === 'Edit');
      data.usesWriteTool = tools.some(t => t.name === 'Write');
      data.usesAgentTool = tools.some(t => t.name === 'Agent' || t.name === 'Task');
      data.usesBrowserTools = tools.some(t => t.name.includes('mcp__'));
      data.usesGrepTool = tools.some(t => t.name === 'Grep' || t.name === 'Glob');
      data.usesNotebookTool = tools.some(t => t.name === 'NotebookEdit');
      data.mcpToolPct = tools.length > 0 ? Math.round(tools.filter(t => t.name.includes('mcp__')).reduce((s,t) => s+t.count, 0) / tools.reduce((s,t) => s+t.count, 0) * 100) : 0;
    } catch {}

    // Development maturity signals
    data.hasTypeConfig = existsSync(join(process.cwd(), 'tsconfig.json'));
    data.hasBiome = existsSync(join(process.cwd(), 'biome.json'));
    data.hasNixFile = existsSync(join(process.cwd(), 'flake.nix')) || existsSync(join(process.cwd(), 'shell.nix'));
    data.hasDevcontainer = existsSync(join(process.cwd(), '.devcontainer'));

    // Environment context
    data.isSSH = !!(process.env.SSH_CLIENT || process.env.SSH_TTY);
    data.isWSL = (() => { try { return readFileSync('/proc/version', 'utf-8').toLowerCase().includes('microsoft'); } catch { return false; } })();
    data.isDocker = existsSync('/.dockerenv');
    data.isCodespaces = !!process.env.CODESPACES;
    data.isGitpod = !!process.env.GITPOD_WORKSPACE_ID;
    data.isTmux = !!(process.env.TMUX || process.env.STY);
    data.colorSupport = process.env.COLORTERM || (process.stdout.hasColors ? 'true' : 'basic');
    data.isFirstRun = !existsSync(join(process.cwd(), 'cchubber-report.html'));

    // CC installation age
    try {
      const configPath = join(claudeDir, 'settings.json');
      if (existsSync(configPath)) {
        const age = Date.now() - statSync(configPath).birthtimeMs;
        data.ccInstallDays = Math.round(age / 86400000);
      }
    } catch {}

    // Conversation depth patterns
    try {
      const projs = report.projectBreakdown || [];
      const totalMsgs = projs.reduce((s, p) => s + p.messageCount, 0);
      const totalSessions = projs.reduce((s, p) => s + p.sessionCount, 0);
      data.avgMsgsPerConversation = totalSessions > 0 ? Math.round(totalMsgs / totalSessions) : 0;
      data.longestProjectMsgs = projs.length > 0 ? projs[0].messageCount : 0;
    } catch {}

    // Weekly patterns (which days are most active)
    try {
      const daily = report.costAnalysis?.dailyCosts || [];
      const dayOfWeek = [0,0,0,0,0,0,0]; // Sun-Sat
      for (const d of daily) {
        if (d.cost > 0) {
          const dow = new Date(d.date + 'T00:00:00').getDay();
          dayOfWeek[dow]++;
        }
      }
      data.activeDaysByWeekday = dayOfWeek;
      data.weekendActive = dayOfWeek[0] + dayOfWeek[6] > 0;
      data.mostActiveDay = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek.indexOf(Math.max(...dayOfWeek))];
    } catch {}

    // Security posture
    data.hasGitignore = existsSync(join(process.cwd(), '.gitignore'));
    data.hasSecurityPolicy = existsSync(join(process.cwd(), 'SECURITY.md'));
    data.hasCodeowners = existsSync(join(process.cwd(), '.github', 'CODEOWNERS'));
    data.hasPRTemplate = existsSync(join(process.cwd(), '.github', 'pull_request_template.md'));
    data.hasIssueTemplates = existsSync(join(process.cwd(), '.github', 'ISSUE_TEMPLATE'));

    // Documentation ratio
    try {
      const cwdFiles = readdirSync(process.cwd());
      const mdFiles = cwdFiles.filter(f => f.endsWith('.md')).length;
      const codeFiles = cwdFiles.filter(f => /\.(js|ts|py|go|rs|java|rb|php)$/.test(f)).length;
      data.docsToCodeRatio = codeFiles > 0 ? Math.round(mdFiles / codeFiles * 100) / 100 : 0;
    } catch {}

    // Prompt verbosity distribution (from daily data)
    try {
      const daily = report.costAnalysis?.dailyCosts || [];
      const msgCounts = daily.filter(d => d.messageCount > 0).map(d => d.messageCount);
      if (msgCounts.length > 0) {
        data.avgMsgsPerDay = Math.round(msgCounts.reduce((s,c) => s+c, 0) / msgCounts.length);
        data.maxMsgsInDay = Math.max(...msgCounts);
        data.minMsgsInDay = Math.min(...msgCounts);
      }
    } catch {}

    // Multi-model sophistication (do they switch models within sessions?)
    try {
      const daily = report.costAnalysis?.dailyCosts || [];
      let multiModelDays = 0;
      for (const d of daily) {
        const models = (d.models || []).map(m => m.model);
        const unique = new Set(models);
        if (unique.size > 1) multiModelDays++;
      }
      data.multiModelDays = multiModelDays;
      data.multiModelPct = daily.length > 0 ? Math.round(multiModelDays / daily.length * 100) : 0;
    } catch {}
    data.hasMakefile = existsSync(join(process.cwd(), 'Makefile'));
    data.hasJustfile = existsSync(join(process.cwd(), 'justfile'));

    // How many projects have CLAUDE.md
    try {
      const projDir = join(claudeDir, 'projects');
      if (existsSync(projDir)) {
        let claudeMdCount = 0;
        for (const d of readdirSync(projDir).slice(0, 30)) {
          // Check if a CLAUDE.md exists in the decoded project path
          const decoded = d.replace(/^([A-Z])--/, '$1:/').replace(/-/g, '/');
          if (existsSync(join(decoded, 'CLAUDE.md'))) claudeMdCount++;
        }
        data.projectsWithClaudeMd = claudeMdCount;
      }
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
