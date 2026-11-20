import { describe, expect, it } from 'vitest';
import { formatScore, gameAccuracy, moveAccuracy, negate, winChance, winPercent } from '@/chess/evaluation';

describe('evaluation', () => {
  it('maps scores to winning chances', () => {
    expect(winChance({ cp: 0, mate: null })).toBe(0);
    expect(winChance({ cp: 100, mate: null })).toBeCloseTo(0.182, 3);
    expect(winChance({ cp: -100, mate: null })).toBeCloseTo(-0.182, 3);
    expect(winChance({ cp: null, mate: 3 })).toBe(1);
    expect(winPercent({ cp: null, mate: -1 })).toBe(0);
  });

  it('negates and formats scores', () => {
    expect(negate({ cp: 35, mate: null })).toEqual({ cp: -35, mate: null });
    expect(negate({ cp: null, mate: 2 })).toEqual({ cp: null, mate: -2 });
    expect(formatScore({ cp: 157, mate: null })).toBe('+1.57');
    expect(formatScore({ cp: null, mate: -1 })).toBe('mat contre toi en 1');
  });

  it('computes move accuracy like Lichess', () => {
    expect(moveAccuracy(50, 50)).toBeCloseTo(100, 0);
    expect(moveAccuracy(60, 30)).toBeCloseTo(24.8, 1);
  });

  it('weighs bad moves heavily in game accuracy', () => {
    const perfect = Array.from({ length: 20 }, () => ({
      wpBefore: 55,
      wpAfter: 55,
      acc: moveAccuracy(55, 55),
    }));
    expect(gameAccuracy(perfect)!).toBeGreaterThan(99);

    const withBlunders = perfect.map((m, i) =>
      i % 5 === 0 ? { wpBefore: 60, wpAfter: 20, acc: moveAccuracy(60, 20) } : m,
    );
    const simpleMean = withBlunders.reduce((s, m) => s + m.acc, 0) / withBlunders.length;
    expect(gameAccuracy(withBlunders)!).toBeLessThan(simpleMean - 10);
    expect(gameAccuracy([])).toBeNull();
  });
});
