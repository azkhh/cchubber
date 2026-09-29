import { readTranscripts, defaultCodexDir } from '../readers/transcripts.js';
import { readStatedPlans, moverVault } from '../readers/stated-plan.js';
import { analyzeDrift } from './drift.js';

const DAY = 86400000;

/**
 * The whole drift pipeline: read the last `days` of local sessions, find what you said you'd do, and label the work.
 * Everything is local. Returns the analysis plus which sources were read, for the report's "how this was measured".
 */
export function runDrift(claudeDir, { days = 7, until = Date.now(), codexDir = defaultCodexDir() } = {}) {
  const start = new Date(until);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  const since = start.getTime();

  const sessions = readTranscripts({ claudeDir, codexDir, since, until });
  const codexSeen = sessions.some(s => s.agent === 'codex');

  const vault = moverVault();
  const plans = readStatedPlans({ vault });
  const drift = analyzeDrift(sessions, { since, until, planFor: plans.planFor, planNotes: plans.notes() });

  return {
    ...drift,
    days,
    inputs: {
      claude: sessions.filter(s => s.agent === 'claude').length,
      codex: sessions.filter(s => s.agent === 'codex').length,
      codexPresent: codexSeen,
      mover: plans.mover,
    },
  };
}
