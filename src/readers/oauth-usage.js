import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'https';

export async function readOAuthUsage(claudeDir) {
  const token = getOAuthToken(claudeDir);
  if (!token) return null;

  try {
    const data = await fetchUsage(token);
    return data;
  } catch {
    // Try cached version
    return readCachedUsage(claudeDir);
  }
}

function getOAuthToken(claudeDir) {
  // Check env var first
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  // Read from credentials file
  const credPath = join(claudeDir, '.credentials.json');
  if (!existsSync(credPath)) return null;

  try {
    const raw = readFileSync(credPath, 'utf-8');
    const creds = JSON.parse(raw);
    return creds?.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function fetchUsage(token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON'));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function readCachedUsage(claudeDir) {
  const cachePath = join(claudeDir, 'tmp', 'statusline-usage.json');
  if (!existsSync(cachePath)) return null;

  try {
    const raw = readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
