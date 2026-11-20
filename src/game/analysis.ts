import { moveAccuracy, scoreCp, winChance, winPercent, gameAccuracy } from '@/chess/evaluation';
import type { MoveClass, Score } from '@/chess/types';
import type { GameStats, Issue, MoveEval, OpponentError, Outcome } from './types';

export interface MoveVerdict {
  cls: MoveClass | null;
  /** Loss in winning chances ([-1, 1] scale), as Lichess uses for its judgements. */
  loss: number;
  cpLoss: number;
  missedMate: boolean;
  wpBefore: number;
  wpAfter: number;
  acc: number;
}

/** Judges a move from the best score available before it and the score after it (mover's view). */
export function judgeMove(bestScore: Score, afterScore: Score, isBest: boolean): MoveVerdict {
  const loss = isBest ? 0 : Math.max(0, winChance(bestScore) - winChance(afterScore));
  const cpLoss = isBest ? 0 : Math.max(0, scoreCp(bestScore) - scoreCp(afterScore));
  let cls: MoveClass | null = null;
  if (loss >= 0.3) cls = 'blunder';
  else if (loss >= 0.2) cls = 'mistake';
  else if (loss >= 0.1 && cpLoss >= 30) cls = 'inaccuracy';
  const missedMate =
    bestScore.mate !== null &&
    bestScore.mate > 0 &&
    bestScore.mate <= 3 &&
    !(afterScore.mate !== null && afterScore.mate > 0);
  if (!cls && missedMate) cls = 'inaccuracy';
  const wpBefore = winPercent(bestScore);
  const wpAfter = isBest ? wpBefore : winPercent(afterScore);
  return { cls, loss, cpLoss, missedMate, wpBefore, wpAfter, acc: moveAccuracy(wpBefore, wpAfter) };
}

/**
 * Detects whether the engine's last move was an error the user could exploit: it raised the user's
 * winning chances a lot and left them at least roughly level.
 */
export function opponentErrorClass(prevAfter: Score, bestNow: Score): OpponentError['cls'] | null {
  const gain = winChance(bestNow) - winChance(prevAfter);
  const cpGain = scoreCp(bestNow) - scoreCp(prevAfter);
  if (cpGain < 80 || winPercent(bestNow) < 45) return null;
  if (gain >= 0.3) return 'blunder';
  if (gain >= 0.2) return 'mistake';
  return null;
}

/** Statistics on first attempts (what the user would have played without the coach) and final moves. */
export function computeStats(
  moveEvals: MoveEval[],
  issues: Issue[],
  engineErrors: OpponentError[],
): GameStats {
  const first = new Map<number, MoveEval>();
  const last = new Map<number, MoveEval>();
  for (const m of moveEvals) {
    if (!first.has(m.ply)) first.set(m.ply, m);
    last.set(m.ply, m);
  }
  const ordered = (map: Map<number, MoveEval>) =>
    [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, m]) => m);
  const firstMoves = ordered(first);
  const counts: Record<MoveClass, number> = { inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const m of firstMoves) if (m.cls) counts[m.cls]++;
  const firstErrors = counts.inaccuracy + counts.mistake + counts.blunder;
  return {
    counts,
    moves: firstMoves.length,
    extraErrors: moveEvals.filter((m) => m.cls).length - firstErrors,
    retried: issues.filter((i) => i.status === 'retried').length,
    rewoundBlunders: issues.filter((i) => i.status === 'retried' && i.cls === 'blunder').length,
    accuracy: gameAccuracy(firstMoves),
    accuracyFinal: gameAccuracy(ordered(last)),
    oppErrors: engineErrors.length,
    oppMissed: engineErrors.filter((e) => e.missedFirst).length,
  };
}

/** Level for the next game. A win that needed take-backs of blunders does not count as a real win. */
export function adaptLevel(
  level: number,
  outcome: Outcome,
  stats: GameStats,
): { level: number; note: string } {
  let delta = 0;
  let note = '';
  if (outcome === 'win') {
    if (stats.rewoundBlunders > 0) note = `victoire aidée (${stats.rewoundBlunders} gaffe(s) rejouée(s))`;
    else delta = stats.accuracy !== null && stats.accuracy >= 85 && stats.counts.blunder === 0 ? 2 : 1;
  } else if (outcome === 'loss') {
    delta = -1;
  }
  return { level: Math.max(1, Math.min(20, level + delta)), note };
}
