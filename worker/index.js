// CC Hubber Telemetry Worker
// Receives anonymous usage stats, stores in KV
// Deploy: cd worker && npx wrangler deploy

export default {
  async fetch(request, env) {
    // CORS headers
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    // POST /collect — store telemetry data
    if (request.method === 'POST' && new URL(request.url).pathname === '/collect') {
      try {
        const data = await request.json();

        // Generate unique key with timestamp
        const key = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // Add server-side metadata
        data._received = new Date().toISOString();
        data._country = request.cf?.country || 'unknown';
        data._key = key;

        // Store in KV (90 day expiry)
        await env.TELEMETRY.put(key, JSON.stringify(data), {
          expirationTtl: 60 * 60 * 24 * 90,
        });

        return new Response(JSON.stringify({ ok: true, key }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 400, headers });
      }
    }

    // GET /stats-public — aggregate summary for leaderboard (no key, limited data)
    if (request.method === 'GET' && new URL(request.url).pathname === '/stats-public') {
      const list = await env.TELEMETRY.list({ limit: 1000 });
      const entries = [];
      for (const key of list.keys) {
        const val = await env.TELEMETRY.get(key.name);
        if (val) entries.push(JSON.parse(val));
      }

      // Public stats — no raw data, no dump, just aggregates + anonymous recent
      const stats = {
        totalReports: entries.length,
        grades: {},
        avgCacheRatio: 0,
        countries: {},
        platforms: {},
      };

      for (const e of entries) {
        stats.grades[e.grade] = (stats.grades[e.grade] || 0) + 1;
        stats.avgCacheRatio += e.cacheRatio || 0;
        stats.countries[e._country] = (stats.countries[e._country] || 0) + 1;
        stats.platforms[e.os] = (stats.platforms[e.os] || 0) + 1;
      }

      if (entries.length > 0) {
        stats.avgCacheRatio = Math.round(stats.avgCacheRatio / entries.length);
      }

      // All entries — grade, ratio, cost bucket, country, os (no timestamps, no UIDs)
      // Send all for accurate leaderboard ranking and percentile
      // Count unique users (by uid) for retention metrics
      const uids = new Set(entries.filter(e => e.uid).map(e => e.uid));
      stats.uniqueUsers = uids.size;
      stats.repeatUsers = entries.filter(e => e.uid).length - uids.size;

      stats.recent = entries.filter(e => e.cacheRatio).map(e => ({
        grade: e.grade, ratio: e.cacheRatio, cost: e.totalCostBucket,
        opus: e.opusPct, country: e._country, os: e.os, v: e.v,
        uuid: e.uid ? e.uid.slice(0, 8) : null,
      }));

      return new Response(JSON.stringify(stats, null, 2), { headers });
    }

    // GET /stats — aggregate summary (password protected)
    if (request.method === 'GET' && new URL(request.url).pathname === '/stats') {
      const url = new URL(request.url);
      const pass = url.searchParams.get('key');
      if (pass !== env.STATS_KEY) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
      }

      // List all telemetry entries
      const list = await env.TELEMETRY.list({ limit: 1000 });
      const entries = [];
      for (const key of list.keys) {
        const val = await env.TELEMETRY.get(key.name);
        if (val) entries.push(JSON.parse(val));
      }

      // Aggregate
      const stats = {
        totalReports: entries.length,
        grades: {},
        avgCacheRatio: 0,
        costBuckets: {},
        avgClaudeMdTokens: 0,
        avgSessionMin: 0,
        modelSplitAvg: { opus: 0, sonnet: 0, haiku: 0 },
        countries: {},
        platforms: {},
        versions: {},
      };

      for (const e of entries) {
        // Grade distribution
        stats.grades[e.grade] = (stats.grades[e.grade] || 0) + 1;
        // Cost buckets
        stats.costBuckets[e.totalCostBucket] = (stats.costBuckets[e.totalCostBucket] || 0) + 1;
        // Averages
        stats.avgCacheRatio += e.cacheRatio || 0;
        stats.avgClaudeMdTokens += e.claudeMdTokens || 0;
        stats.avgSessionMin += e.avgSessionMin || 0;
        stats.modelSplitAvg.opus += e.opusPct || 0;
        stats.modelSplitAvg.sonnet += e.sonnetPct || 0;
        stats.modelSplitAvg.haiku += e.haikuPct || 0;
        // Countries
        stats.countries[e._country] = (stats.countries[e._country] || 0) + 1;
        // Platforms
        stats.platforms[e.os] = (stats.platforms[e.os] || 0) + 1;
        // Versions
        stats.versions[e.v] = (stats.versions[e.v] || 0) + 1;
      }

      if (entries.length > 0) {
        stats.avgCacheRatio = Math.round(stats.avgCacheRatio / entries.length);
        stats.avgClaudeMdTokens = Math.round(stats.avgClaudeMdTokens / entries.length);
        stats.avgSessionMin = Math.round(stats.avgSessionMin / entries.length);
        stats.modelSplitAvg.opus = Math.round(stats.modelSplitAvg.opus / entries.length);
        stats.modelSplitAvg.sonnet = Math.round(stats.modelSplitAvg.sonnet / entries.length);
        stats.modelSplitAvg.haiku = Math.round(stats.modelSplitAvg.haiku / entries.length);
      }

      // Recent entries (last 20)
      stats.recent = entries.slice(-20).map(e => ({
        ts: e.ts, grade: e.grade, ratio: e.cacheRatio, cost: e.totalCostBucket,
        opus: e.opusPct, claudeMd: e.claudeMdTokens, sessions: e.sessionCount,
        country: e._country, os: e.os,
      }));

      return new Response(JSON.stringify(stats, null, 2), { headers });
    }

    // GET /dump — raw data export (password protected)
    if (request.method === 'GET' && new URL(request.url).pathname === '/dump') {
      const url = new URL(request.url);
      const pass = url.searchParams.get('key');
      if (pass !== env.STATS_KEY) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers });
      }

      const list = await env.TELEMETRY.list({ limit: 1000 });
      const entries = [];
      for (const key of list.keys) {
        const val = await env.TELEMETRY.get(key.name);
        if (val) entries.push(JSON.parse(val));
      }

      return new Response(JSON.stringify(entries, null, 2), { headers });
    }

    return new Response(JSON.stringify({ service: 'cchubber-telemetry', endpoints: ['/collect', '/stats?key=', '/dump?key='] }), { headers });
  },
};
