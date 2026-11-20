import type { Score } from './types';

const MATE_CP = 1500;

/** Winning chances in [-1, 1] as used by Lichess (2 / (1 + e^(-0.00368208·cp)) − 1). */
export function winChance(score: Score): number {
  if (score.mate !== null) return score.mate > 0 ? 1 : -1;
  const cp = Math.max(-MATE_CP, Math.min(MATE_CP, score.cp ?? 0));
  return 2 / (1 + Math.exp(-0.00368208 * cp)) - 1;
}

export const winPercent = (score: Score): number => 50 + 50 * winChance(score);

/** Centipawns clamped to ±1500, mates mapped to the bounds. */
export function scoreCp(score: Score): number {
  if (score.mate !== null) return score.mate > 0 ? MATE_CP : -MATE_CP;
  return Math.max(-MATE_CP, Math.min(MATE_CP, score.cp ?? 0));
}

/** The same score seen by the other side. */
export function negate(score: Score): Score {
  if (score.mate !== null) return { cp: null, mate: -score.mate };
  return { cp: -(score.cp ?? 0), mate: null };
}

export function formatScore(score: Score | null | undefined): string {
  if (!score) return '?';
  if (score.mate !== null)
    return score.mate > 0 ? `mat en ${score.mate}` : `mat contre toi en ${-score.mate}`;
  const v = (score.cp ?? 0) / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/** Lichess move accuracy from the mover's win% before and after the move. */
export function moveAccuracy(winPctBefore: number, winPctAfter: number): number {
  const a = 103.1668 * Math.exp(-0.04354 * Math.max(0, winPctBefore - winPctAfter)) - 3.1669;
  return Math.max(0, Math.min(100, a));
}

export interface AccuracyInput {
  wpBefore: number;
  wpAfter: number;
  acc: number;
}

/**
 * Game accuracy as computed by Lichess (lila AccuracyPercent.gameAccuracy): the average of a
 * volatility-weighted mean and a harmonic mean of the move accuracies. `moves` are one player's moves
 * in order, with win% (from that player's view) before and after each move.
 */
export function gameAccuracy(moves: AccuracyInput[]): number | null {
  if (!moves.length) return null;
  // Positions sequence: before/after each move, so consecutive pairs alternate
  // player move / opponent move as in Lichess.
  const positions: number[] = [];
  for (const m of moves) positions.push(m.wpBefore, m.wpAfter);
  const plies = positions.length - 1;
  const windowSize = Math.max(2, Math.min(8, Math.floor(plies / 10)));
  const windows: number[][] = [];
  for (let i = 0; i < Math.min(windowSize, positions.length) - 2; i++) {
    windows.push(positions.slice(0, windowSize));
  }
  for (let i = 0; i + windowSize <= positions.length; i++) windows.push(positions.slice(i, i + windowSize));
  const stdDev = (xs: number[]): number => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  };
  const weights = windows.map((xs) => Math.max(0.5, Math.min(12, stdDev(xs))));
  let weightSum = 0;
  let weighted = 0;
  let inverseSum = 0;
  moves.forEach((m, k) => {
    const w = weights[2 * k] ?? 0.5;
    weightSum += w;
    weighted += m.acc * w;
    inverseSum += 1 / Math.max(1, m.acc);
  });
  return (weighted / weightSum + moves.length / inverseSum) / 2;
}
