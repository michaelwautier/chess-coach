import { describe, expect, it } from 'vitest';
import { ChessClock, formatClock } from '@/game/clock';

describe('ChessClock', () => {
  it('runs one side at a time and adds increments', () => {
    let now = 0;
    const clock = new ChessClock(60000, 2000, () => now);
    clock.start('w');
    now = 5000;
    expect(clock.remaining('w')).toBe(55000);
    clock.stop();
    clock.addIncrement('w');
    now = 9000;
    expect(clock.remaining('w')).toBe(57000);
    clock.start('b');
    now = 70000;
    expect(clock.flagged()).toBe('b');
  });

  it('formats remaining time', () => {
    expect(formatClock(600000)).toBe('10:00');
    expect(formatClock(61000)).toBe('1:01');
    expect(formatClock(9400)).toBe('9.4');
    expect(formatClock(-5)).toBe('0.0');
  });
});
