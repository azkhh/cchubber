# CC Hubber Telemetry — How to Access Your Data

## Endpoints

All endpoints are on your Cloudflare Worker:
**Base URL:** `https://cchubber-telemetry.asmirkhan087.workers.dev`

### 1. Aggregated Stats (quick overview)
```
GET /stats?key=cchubber_stats_2026
```
Returns: total reports, grade distribution, average cache ratio, cost buckets, model split averages, countries, platforms, versions, last 20 entries summary.

### 2. Raw Data Dump (every single entry)
```
GET /dump?key=cchubber_stats_2026
```
Returns: full JSON array of every telemetry payload ever received. Each entry has ALL fields collected from the user's machine.

### 3. Quick Check
```
GET /
```
Returns: service info and available endpoints.

## How to Query

**From terminal:**
```bash
# Quick stats
curl "https://cchubber-telemetry.asmirkhan087.workers.dev/stats?key=cchubber_stats_2026"

# Full dump (pipe to file for analysis)
curl "https://cchubber-telemetry.asmirkhan087.workers.dev/dump?key=cchubber_stats_2026" > telemetry-dump.json

# Count unique users
curl -s "https://cchubber-telemetry.asmirkhan087.workers.dev/dump?key=cchubber_stats_2026" | python -c "import sys,json;d=json.load(sys.stdin);print(len(set(e.get('uid','?') for e in d)),'unique users')"

# Grade distribution
curl -s "https://cchubber-telemetry.asmirkhan087.workers.dev/stats?key=cchubber_stats_2026" | python -c "import sys,json;d=json.load(sys.stdin);print('Grades:',d['grades'])"
```

**From browser:** Just paste the URL with the key parameter.

**From JavaScript/Node:**
```js
const res = await fetch('https://cchubber-telemetry.asmirkhan087.workers.dev/dump?key=cchubber_stats_2026');
const data = await res.json();
console.log(`${data.length} reports from ${new Set(data.map(d => d.uid)).size} unique users`);
```

## Data Fields Per Entry

### Core Usage
| Field | Type | Example |
|-------|------|---------|
| `uid` | string | `u_k3m9x2p4` (anonymous, persistent per machine) |
| `grade` | string | `C` |
| `cacheRatio` | number | `921` |
| `cacheHitRate` | number | `85.2` |
| `cacheBreaks` | number | `0` |
| `estimatedBreaks` | number | `569` |
| `activeDays` | number | `44` |
| `totalCostBucket` | string | `1K-5K` |
| `avgDailyCost` | number | `85` |
| `peakDayCost` | number | `330` |

### Model Usage
| Field | Type | Example |
|-------|------|---------|
| `opusPct` | number | `93` |
| `sonnetPct` | number | `7` |
| `haikuPct` | number | `0` |
| `subagentPct` | number | `12` |
| `modelCount` | number | `3` |

### CLAUDE.md
| Field | Type | Example |
|-------|------|---------|
| `claudeMdTokens` | number | `12349` |
| `claudeMdBytes` | number | `48200` |
| `claudeMdSections` | number | `18` |
| `claudeMdFiles` | number | `3` |
| `claudeMdTopSections` | array | `[{name:"System Awareness",tokens:2048}]` |

### Sessions
| Field | Type | Example |
|-------|------|---------|
| `sessionCount` | number | `29` |
| `avgSessionMin` | number | `380` |
| `medianSessionMin` | number | `8` |
| `p90SessionMin` | number | `448` |
| `maxSessionMin` | number | `8664` |
| `longSessionPct` | number | `24` |
| `avgToolsPerSession` | number | `15` |
| `linesPerHour` | number | `10` |
| `topTools` | array | `["Read","Bash","Edit"]` |
| `hourDistribution` | array | 24 values, messages per hour |

### Environment
| Field | Type | Example |
|-------|------|---------|
| `os` | string | `win32` |
| `arch` | string | `x64` |
| `nodeVersion` | string | `v22.0.0` |
| `ccVersion` | string | `2.1.90` |
| `mcpServerCount` | number | `5` |
| `mcpServers` | array | `["context7","notebooklm"]` |
| `hasHooks` | boolean | `true` |
| `hookCount` | number | `8` |
| `skillCount` | number | `12` |
| `hasClaudeignore` | boolean | `false` |
| `hasOauthCreds` | boolean | `true` |
| `invokedAs` | string | `npx` |

### Tech Stack Detection
| Field | Type | Example |
|-------|------|---------|
| `usesReact` | boolean | `true` |
| `usesVue` | boolean | `false` |
| `usesTypescript` | boolean | `true` |
| `usesTailwind` | boolean | `true` |
| `isPython` | boolean | `false` |
| `isRust` | boolean | `false` |
| `isGo` | boolean | `false` |
| `depCount` | number | `42` |
| `isGitHub` | boolean | `true` |

### Server-Side (added by Worker)
| Field | Type | Example |
|-------|------|---------|
| `_received` | string | `2026-04-03T03:12:30Z` |
| `_country` | string | `GB` |
| `_key` | string | `t_1775185950847_e8y4ns` |

## Security

- **Stats key:** `cchubber_stats_2026` (change in `worker/wrangler.toml` → `STATS_KEY`)
- **Data retention:** 90 days (KV TTL)
- **No PII:** No names, emails, IPs, file contents, or project names stored
- **Opt out:** Users can run `--no-telemetry` or set `CC_HUBBER_TELEMETRY=0`

## Useful Queries

```python
# Load and analyze in Python
import json, requests

data = requests.get('https://cchubber-telemetry.asmirkhan087.workers.dev/dump?key=cchubber_stats_2026').json()

# Unique users
uids = set(e.get('uid') for e in data)
print(f"{len(uids)} unique users, {len(data)} total runs")

# Grade distribution
from collections import Counter
grades = Counter(e.get('grade') for e in data)
print(f"Grades: {dict(grades)}")

# Average CLAUDE.md size
avg_cmd = sum(e.get('claudeMdTokens',0) for e in data) / max(len(data),1)
print(f"Avg CLAUDE.md: {avg_cmd:.0f} tokens")

# Most popular MCP servers
from itertools import chain
mcps = Counter(chain.from_iterable(e.get('mcpServers',[]) for e in data))
print(f"Top MCP servers: {mcps.most_common(10)}")

# Country distribution
countries = Counter(e.get('_country') for e in data)
print(f"Countries: {dict(countries)}")
```
