import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { levelConfig, pickEngineMove } from '@/engine/levels';
import { parseInfo, type SearchResult } from '@/engine/uci';

const START = new Chess();
const result: SearchResult = {
  bestmove: 'e2e4',
  depth: 10,
  lines: [
    { multipv: 1, depth: 10, cp: 40, mate: null, pv: ['e2e4'] },
    { multipv: 2, depth: 10, cp: 30, mate: null, pv: ['d2d4'] },
    { multipv: 3, depth: 10, cp: -80, mate: null, pv: ['g2g4'] },
  ],
};

describe('parseInfo', () => {
  it('parses scores, multipv and the principal variation', () => {
    expect(parseInfo('info depth 12 seldepth 18 multipv 2 score cp -35 nodes 1000 pv e7e5 g1f3')).toEqual({
      depth: 12,
      multipv: 2,
      cp: -35,
      mate: null,
      pv: ['e7e5', 'g1f3'],
    });
    expect(parseInfo('info depth 5 score mate 3 pv d1h5')?.mate).toBe(3);
    expect(parseInfo('info depth 12 score cp 20 lowerbound pv e2e4')).toBeNull();
    expect(parseInfo('info string NNUE enabled')).toBeNull();
  });
});

describe('pickEngineMove', () => {
  it('always plays the best line at the top level', () => {
    expect(pickEngineMove(result, 20, START, () => 0.99)).toBe('e2e4');
  });

  it('can play a weaker candidate at low levels', () => {
    // random() < blunder → uniform pick among candidates; 0.7 * 3 → index 2.
    const values = [0.5, 0.01, 0.7];
    const rng = () => values.shift() ?? 0.5;
    expect(pickEngineMove(result, 5, START, rng)).toBe('g2g4');
  });

  it('clamps levels', () => {
    expect(levelConfig(0)).toEqual(levelConfig(1));
    expect(levelConfig(99)).toEqual(levelConfig(20));
  });
});
