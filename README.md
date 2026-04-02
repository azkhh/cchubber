# CC Hubber

**What you spent. Why you spent it. Is that normal.**

Offline CLI that reads your local Claude Code data and generates a diagnostic HTML report. No API keys. No telemetry. Everything stays on your machine.

Built because Claude Code users had zero visibility into the [March 2026 cache bug](https://github.com/anthropics/claude-code/issues/41930) that silently inflated costs by 10-20x. Your `$100 plan` shouldn't feel like a `$20 plan`.

![CC Hubber Report](https://raw.githubusercontent.com/azkhh/cchubber/master/screenshot.png)

## What it does

- **Cost breakdown** — Per-day, per-model, per-project cost calculated from your actual token counts
- **Cache health grade** — Trend-weighted (recent 7 days dominate). If you hit the cache bug, you'll see D/F, not a misleading A
- **Inflection point detection** — "Your efficiency dropped 4.7x starting March 29. Before: 360:1. After: 1,676:1."
- **Anomaly detection** — Flags days where your cost/ratio deviates >2 standard deviations
- **Cache break analysis** — Reads `~/.claude/tmp/cache-break-*.diff` files. Shows why your cache broke and how often
- **CLAUDE.md cost analysis** — How much your rules files cost per message (cached vs uncached)
- **Per-project breakdown** — Which project is eating your budget
- **Live rate limits** — 5-hour and 7-day utilization (if OAuth token available)
- **Shareable card** — Export your report as a PNG

## Install

```bash
npx cchubber
```

Or install globally:

```bash
npm install -g cchubber
cchubber
```

Requires Node.js 18+. Runs on macOS, Windows, and Linux.

## Usage

```bash
cchubber                      # Scan and open HTML report
cchubber --days 7             # Default view: last 7 days
cchubber -o report.html       # Custom output path
cchubber --no-open            # Don't auto-open in browser
cchubber --json               # Machine-readable JSON output
```

## What it reads

All data is local. Nothing leaves your machine.

| Source | Path | What |
|--------|------|------|
| JSONL conversations | `~/.claude/projects/*/` | Token counts per message, per model, per session |
| Stats cache | `~/.claude/stats-cache.json` | Pre-aggregated daily totals |
| Session meta | `~/.claude/usage-data/session-meta/` | Duration, tool counts, lines changed |
| Cache breaks | `~/.claude/tmp/cache-break-*.diff` | Why your prompt cache invalidated |
| CLAUDE.md stack | `~/.claude/CLAUDE.md`, project-level | File sizes and per-message cost impact |
| OAuth usage | `~/.claude/.credentials.json` | Live rate limit utilization |

## The March 2026 cache bug

Between v2.1.69 and v2.1.89, multiple bugs caused Claude Code's prompt cache to silently fail:

- A sentinel replacement bug in the Bun fork dropped cache read rates from ~95% to 4-17%
- The `--resume` flag caused full prompt-cache misses on every resume
- One session generated 652,069 output tokens with no user input — $342 on a single session

**v2.1.90 fixes most of these.** Update immediately: `claude update`

CC Hubber detects whether you were affected by showing your cache efficiency trend over time. If you see a sharp inflection point, that's probably when it hit you.

## Best practices (from the community)

These tips surfaced during the March crisis. CC Hubber helps you verify whether they're working:

- **Start fresh sessions per task** — don't try to extend long sessions
- **Avoid `--resume` on older versions** — fixed in v2.1.90
- **Switch to Sonnet 4.6 for routine work** — same quality, fraction of the quota
- **Keep CLAUDE.md under 200 lines** — it's re-read on every message
- **Use `/compact` every 30-40 tool calls** — prevents context bloat
- **Create `.claudeignore`** — exclude `node_modules/`, `dist/`, `*.lock`
- **Shift heavy work to off-peak hours** — outside 5am-11am PT weekdays

## How cost is calculated

Claude Code doesn't report costs for Max/Pro plans (`costUSD` is always 0). CC Hubber calculates costs from token counts using dynamic pricing from [LiteLLM](https://github.com/BerriAI/litellm), with hardcoded fallbacks.

This gives you an **equivalent API cost** — what you would pay on the API tier for the same usage. Useful for understanding relative consumption, not for billing disputes.

## Prior art

- [ccusage](https://github.com/jikyo/ccusage) (12K+ stars) — token tracking and cost visualization
- [Claude-Code-Usage-Monitor](https://github.com/nicobailon/Claude-Code-Usage-Monitor) — basic session tracking

CC Hubber focuses on **diagnosis** — cache health grading, inflection detection, cache break analysis — not just accounting. If ccusage tells you *what* you spent, CC Hubber tells you *why* and whether it's normal.

## License

MIT

## Credits

Built by [@azkhh](https://x.com/asmirkn). Shipped with [Mover OS](https://moveros.dev).
