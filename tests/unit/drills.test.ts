import { describe, expect, it } from 'vitest';
import {
  INTERVAL_DAYS,
  MAX_DRILLS,
  drillFromIssue,
  dueDrills,
  gradeDrill,
  isRetired,
  mergeDrills,
  nextDue,
  positionKey,
  sanitizeDrills,
  solves,
  type Drill,
} from '@/game/drills';
import type { Issue } from '@/game/types';

const DAY = 86400000;
const NOW = Date.UTC(2026, 10, 20, 12);
const FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

const issue = (over: Partial<Issue> = {}): Issue =>
  ({
    id: '3-1',
    ply: 3,
    moveLabel: '2… f6',
    san: 'f6',
    uci: 'f7f6',
    from: 'f7',
    to: 'f6',
    fenBefore: FEN,
    fenAfter: '',
    cls: 'mistake',
    missedMate: false,
    bestUci: 'b8c6',
    bestSan: 'Nc6',
    topLines: [{ uci: 'b8c6', text: '2… Cc6 3. Fb5', eval: '+0,3' }],
    opp: null,
    coach: {
      status: 'done',
      sections: { INDICE: 'Défends e5.', LECON: 'Développe.', THEME: 'développement' },
      raw: 'x',
      error: '',
    },
    ...over,
  }) as Issue;

const drill = (over: Partial<Drill> = {}): Drill => ({
  ...drillFromIssue(issue(), '2026-11-19T10:00:00.000Z', NOW - 2 * DAY)!,
  ...over,
});

describe('exercises from mistakes', () => {
  it('makes exercises from mistakes, blunders and missed chances only', () => {
    const d = drillFromIssue(issue(), 'game', NOW)!;
    expect(d).toMatchObject({
      id: positionKey(FEN),
      fen: FEN,
      color: 'b',
      playedSan: 'f6',
      bestUci: 'b8c6',
      line: '2… Cc6 3. Fb5',
      hint: 'Défends e5.',
      lesson: 'Développe.',
      theme: 'développement',
      box: 0,
      dueAt: NOW + DAY,
    });
    expect(drillFromIssue(issue({ cls: 'inaccuracy' }), 'game', NOW)).toBeNull();
    const opp = { san: 'Qh4', from: 'd8', to: 'h4', cls: 'blunder' } as Issue['opp'];
    expect(drillFromIssue(issue({ cls: 'inaccuracy', opp }), 'game', NOW)).toMatchObject({
      cls: 'blunder',
      opp: { san: 'Qh4', from: 'd8', to: 'h4' },
    });
  });

  it('keeps one exercise per position and starts it over when the mistake comes back', () => {
    const old = drill({ box: 3, dueAt: NOW + 10 * DAY, createdAt: NOW - 30 * DAY });
    const again = drillFromIssue(issue({ fenBefore: FEN.replace('1 2', '3 5') }), 'later', NOW)!;
    const merged = mergeDrills([old], [again]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      box: 0,
      dueAt: NOW + DAY,
      source: 'later',
      lapses: 1,
      createdAt: NOW - 30 * DAY,
    });
  });

  it('drops retired exercises first, then the oldest, beyond the limit', () => {
    const many = Array.from({ length: MAX_DRILLS + 2 }, (_, i) =>
      drill({ id: `p${i}`, createdAt: NOW + i, box: i === 150 ? INTERVAL_DAYS.length : 0 }),
    );
    const kept = mergeDrills(many, []);
    expect(kept).toHaveLength(MAX_DRILLS);
    expect(kept.some((d) => d.id === 'p150')).toBe(false);
    expect(kept.some((d) => d.id === 'p0')).toBe(false);
    expect(kept.some((d) => d.id === 'p1')).toBe(true);
  });

  it('lists due exercises, most overdue first', () => {
    const list = [
      drill({ id: 'a', dueAt: NOW - DAY }),
      drill({ id: 'b', dueAt: NOW + DAY }),
      drill({ id: 'c', dueAt: NOW - 3 * DAY }),
      drill({ id: 'd', dueAt: NOW - 5 * DAY, box: INTERVAL_DAYS.length }),
    ];
    expect(dueDrills(list, NOW).map((d) => d.id)).toEqual(['c', 'a']);
    expect(nextDue(list)).toBe(NOW - 3 * DAY);
    expect(nextDue([list[3]])).toBeNull();
  });

  it('spaces exercises out as they are solved and retires them after 30 days', () => {
    let d = drill();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      d = gradeDrill(d, true, NOW);
      seen.push((d.dueAt - NOW) / DAY);
    }
    expect(seen).toEqual([3, 7, 14, 30]);
    expect(isRetired(d)).toBe(false);
    d = gradeDrill(d, true, NOW);
    expect(isRetired(d)).toBe(true);
    expect(dueDrills([d], Number.MAX_SAFE_INTEGER)).toEqual([]);

    const failed = gradeDrill(drill({ box: 3 }), false, NOW);
    expect(failed).toMatchObject({ box: 0, dueAt: NOW + DAY, lapses: 1 });
  });

  it('accepts any move close enough to the best one', () => {
    expect(solves({ loss: 0, missedMate: false })).toBe(true);
    expect(solves({ loss: 0.09, missedMate: false })).toBe(true);
    expect(solves({ loss: 0.1, missedMate: false })).toBe(false);
    expect(solves({ loss: 0.01, missedMate: true })).toBe(false);
  });

  it('reads stored exercises back, dropping malformed ones and duplicates', () => {
    const good = drill();
    const stored = JSON.parse(
      JSON.stringify([good, good, { ...good, fen: 3 }, { ...good, id: 'x', cls: 'oops' }, 'junk']),
    );
    expect(sanitizeDrills(stored)).toEqual([good]);
    expect(sanitizeDrills(null)).toEqual([]);
  });
});
