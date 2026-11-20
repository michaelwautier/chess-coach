import type { Issue, Phase } from './types';

/**
 * How far the game went after the user chose "Continuer" on a coached issue:
 * - `thinking`: the engine has not played its reply yet;
 * - `replied`: the engine has replied and the user has not moved since.
 */
export type ContinueUndoStage = 'thinking' | 'replied';

/**
 * Whether "Continuer" can still be undone to get the coaching pause back, and what must be taken back.
 * Null once the user has moved again, asked for advice, or the game is over.
 */
export function continueUndoStage(
  issue: Pick<Issue, 'ply' | 'status'> | null,
  phase: Phase,
  plies: number,
): ContinueUndoStage | null {
  if (issue?.status !== 'continued') return null;
  if (phase === 'engine' && plies === issue.ply + 1) return 'thinking';
  if (phase === 'user' && plies === issue.ply + 2) return 'replied';
  return null;
}
