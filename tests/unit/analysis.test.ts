import { describe, expect, it } from 'vitest';
import { adaptLevel, computeStats, judgeMove, opponentErrorClass } from '@/game/analysis';
import type { GameStats, Issue, MoveEval } from '@/game/types';

const cp = (v: number) => ({ cp: v, mate: null });

describe('judgeMove', () => {
  it('classifies by loss of winning chances', () => {
    expect(judgeMove(cp(30), cp(30), true).cls).toBeNull();
    expect(judgeMove(cp(30), cp(-60), false).cls).toBe('inaccuracy');
    expect(judgeMove(cp(30), cp(-95), false).cls).toBe('mistake');
    expect(judgeMove(cp(30), cp(-400), false).cls).toBe('blunder');
  });

  it('flags a missed short mate', () => {
    const v = judgeMove({ cp: null, mate: 2 }, cp(900), false);
    expect(v.missedMate).toBe(true);
    expect(v.cls).toBe('inaccuracy');
  });
});

describe('opponentErrorClass', () => {
  it('detects an exploitable engine error', () => {
    expect(opponentErrorClass(cp(0), cp(350))).toBe('blunder');
    expect(opponentErrorClass(cp(0), cp(150))).toBe('mistake');
    expect(opponentErrorClass(cp(0), cp(40))).toBeNull();
  });

  it('ignores errors that only make a lost position less lost', () => {
    expect(opponentErrorClass({ cp: null, mate: -1 }, cp(-190))).toBeNull();
  });
});

describe('computeStats', () => {
  const evals: MoveEval[] = [
    { ply: 0, acc: 40, wpBefore: 55, wpAfter: 35, cls: 'mistake' },
    { ply: 0, acc: 100, wpBefore: 55, wpAfter: 55, cls: null },
    { ply: 2, acc: 100, wpBefore: 55, wpAfter: 55, cls: null },
  ];
  const retried = { status: 'retried', cls: 'mistake' } as Issue;

  it('counts first attempts and keeps corrections separate', () => {
    const s = computeStats(evals, [retried], []);
    expect(s.counts).toEqual({ inaccuracy: 0, mistake: 1, blunder: 0 });
    expect(s.moves).toBe(2);
    expect(s.retried).toBe(1);
    expect(s.accuracy!).toBeLessThan(s.accuracyFinal!);
  });
});

describe('adaptLevel', () => {
  const base: GameStats = {
    counts: { inaccuracy: 0, mistake: 0, blunder: 0 },
    moves: 30,
    extraErrors: 0,
    retried: 0,
    rewoundBlunders: 0,
    accuracy: 90,
    accuracyFinal: 90,
    oppErrors: 0,
    oppMissed: 0,
  };

  it('raises the level after a clean win', () => {
    expect(adaptLevel(9, 'win', base).level).toBe(11);
    expect(adaptLevel(9, 'win', { ...base, accuracy: 70 }).level).toBe(10);
  });

  it('does not reward a win that needed rewound blunders', () => {
    const r = adaptLevel(9, 'win', { ...base, rewoundBlunders: 2 });
    expect(r.level).toBe(9);
    expect(r.note).toContain('victoire aidée');
  });

  it('lowers the level after a loss, within bounds', () => {
    expect(adaptLevel(9, 'loss', base).level).toBe(8);
    expect(adaptLevel(1, 'loss', base).level).toBe(1);
    expect(adaptLevel(20, 'win', base).level).toBe(20);
  });
});
