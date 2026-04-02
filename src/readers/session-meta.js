import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function readSessionMeta(claudeDir) {
  const metaDir = join(claudeDir, 'usage-data', 'session-meta');
  if (!existsSync(metaDir)) return [];

  const sessions = [];

  try {
    const files = readdirSync(metaDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const raw = readFileSync(join(metaDir, file), 'utf-8');
        const data = JSON.parse(raw);
        sessions.push({
          sessionId: data.session_id || file.replace('.json', ''),
          projectPath: data.project_path || 'unknown',
          startTime: data.start_time || null,
          durationMinutes: data.duration_minutes || 0,
          userMessageCount: data.user_message_count || 0,
          assistantMessageCount: data.assistant_message_count || 0,
          toolCounts: data.tool_counts || {},
          inputTokens: data.input_tokens || 0,
          outputTokens: data.output_tokens || 0,
          usesTaskAgent: data.uses_task_agent || false,
          usesMcp: data.uses_mcp || false,
          linesAdded: data.lines_added || 0,
          linesRemoved: data.lines_removed || 0,
          filesModified: data.files_modified || 0,
        });
      } catch {
        // Skip corrupt files
      }
    }
  } catch {
    return [];
  }

  return sessions.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}
