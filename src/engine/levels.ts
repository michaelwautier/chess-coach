import type { Chess } from 'chess.js';
import { uciOf } from '@/chess/notation';
import type { SearchResult } from './uci';

/**
 * Opponent strength. depth: search depth; k: candidate lines (MultiPV); t: softmax temperature in
 * centipawns (0 = always the best move); blunder: chance to pick any of the k candidates;
 * random: chance to play any legal move. Levels are not calibrated against human ratings.
 */
export interface Level {
  depth: number;
  k: number;
  t: number;
  blunder: number;
  random: number;
}

export const LEVELS: readonly Level[] = [
  { depth: 1, k: 10, t: 400, blunder: 0.2, random: 0.15 },
  { depth: 2, k: 10, t: 300, blunder: 0.15, random: 0.1 },
  { depth: 2, k: 8, t: 220, blunder: 0.12, random: 0.06 },
  { depth: 3, k: 8, t: 170, blunder: 0.1, random: 0.03 },
  { depth: 3, k: 7, t: 130, blunder: 0.08, random: 0 },
  { depth: 4, k: 6, t: 100, blunder: 0.06, random: 0 },
  { depth: 5, k: 6, t: 80, blunder: 0.05, random: 0 },
  { depth: 5, k: 5, t: 65, blunder: 0.04, random: 0 },
  { depth: 6, k: 5, t: 50, blunder: 0.03, random: 0 },
  { depth: 7, k: 4, t: 40, blunder: 0.025, random: 0 },
  { depth: 8, k: 4, t: 32, blunder: 0.02, random: 0 },
  { depth: 9, k: 4, t: 25, blunder: 0.015, random: 0 },
  { depth: 10, k: 3, t: 20, blunder: 0.01, random: 0 },
  { depth: 11, k: 3, t: 15, blunder: 0.008, random: 0 },
  { depth: 12, k: 3, t: 11, blunder: 0.005, random: 0 },
  { depth: 13, k: 2, t: 8, blunder: 0.003, random: 0 },
  { depth: 14, k: 2, t: 5, blunder: 0, random: 0 },
  { depth: 16, k: 2, t: 3, blunder: 0, random: 0 },
  { depth: 18, k: 1, t: 0, blunder: 0, random: 0 },
  { depth: 22, k: 1, t: 0, blunder: 0, random: 0 },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = LEVELS.length;

export const levelConfig = (level: number): Level =>
  LEVELS[Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level))) - 1];

/** Mate scores dominate any centipawn score; shorter mates are preferred. */
const candidateValue = (l: SearchResult['lines'][number]): number =>
  l.mate !== null ? (l.mate > 0 ? 100000 - l.mate * 100 : -100000 - l.mate * 100) : (l.cp ?? 0);

/** Chooses the engine's move among the candidate lines according to the level. */
export function pickEngineMove(
  res: SearchResult,
  level: number,
  chess: Chess,
  random: () => number = Math.random,
): string | null {
  const p = levelConfig(level);
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;
  if (random() < p.random) return uciOf(legal[Math.floor(random() * legal.length)]);
  const candidates = res.lines
    .filter((l) => l.pv.length > 0)
    .map((l) => ({ uci: l.pv[0], v: candidateValue(l) }));
  if (!candidates.length) return res.bestmove ?? uciOf(legal[0]);
  if (candidates.length > 1 && random() < p.blunder)
    return candidates[Math.floor(random() * candidates.length)].uci;
  if (p.t <= 0) return candidates[0].uci;
  const best = Math.max(...candidates.map((c) => c.v));
  const weights = candidates.map((c) => Math.exp(-Math.min(50, (best - c.v) / p.t)));
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i].uci;
  }
  return candidates[0].uci;
}
