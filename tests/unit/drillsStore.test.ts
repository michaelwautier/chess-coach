import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { positionKey, type Drill } from '@/game/drills';
import type { Issue } from '@/game/types';
import { useDrillsStore } from '@/stores/drills';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';

/**
 * Exercise sessions with a fake analyst: in any position the best move is e2e4 (+0.5) and d2d4 is close
 * (+0.4); any other move gets a strong reply from Black (−3.0 for White).
 */
vi.mock('@/engine/engine', () => {
  class Engine {
    async init() {
      return { name: 'fake', js: '', wasm: null, timeoutMs: 0 };
    }
  }
  return { Engine, engineBuilds: () => [] };
});

vi.mock('@/game/analyst', () => {
  const line = (cp: number, pv: string[]) => ({ depth: 16, multipv: 1, cp, mate: null, pv });
  class Analyst {
    started: string[] = [];
    start(fen: string) {
      this.started.push(fen);
    }
    stop() {}
    async ensure() {
      return { depth: 16, lines: [line(50, ['e2e4', 'e7e5']), line(40, ['d2d4', 'd7d5'])] };
    }
    async evaluate() {
      return line(300, ['d8h4', 'g2g3']);
    }
  }
  return { Analyst };
});

vi.mock('@/coach/runCoach', () => ({ runCoach: async () => {} }));

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const OTHER = 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2';
const DAY = 86400000;

const drill = (fen: string, over: Partial<Drill> = {}): Drill => ({
  id: positionKey(fen),
  fen,
  color: 'w',
  playedUci: 'f2f3',
  playedSan: 'f3',
  bestUci: 'e2e4',
  bestSan: 'e4',
  line: '1. e4 e5',
  cls: 'mistake',
  opp: null,
  hint: '',
  lesson: '',
  theme: '',
  source: '2026-11-19T10:00:00.000Z',
  createdAt: Date.now() - 3 * DAY,
  dueAt: Date.now() - DAY,
  box: 0,
  lapses: 0,
  ...over,
});

describe('exercise sessions', () => {
  let saved: Drill[][];

  beforeEach(async () => {
    setActivePinia(createPinia());
    saved = [];
    const settings = useSettingsStore();
    vi.spyOn(settings, 'saveDrills').mockImplementation(async (d) => void saved.push(d));
    vi.spyOn(settings, 'loadDrills').mockResolvedValue([]);
    await useGameStore().initEngines();
  });

  afterEach(() => vi.restoreAllMocks());

  it('grades the first answer, accepts close moves and schedules the next review', async () => {
    const drills = useDrillsStore();
    drills.drills = [
      drill(START),
      drill(OTHER, { dueAt: Date.now() - 2 * DAY }),
      drill(START.replace('w', 'b'), { dueAt: Date.now() + DAY }),
    ];
    drills.start();
    expect(drills.session?.queue.map((d) => d.fen)).toEqual([OTHER, START]);

    // A wrong move: graded as failed at once, with the engine's reply; retrying does not change the grade.
    await drills.play('a2a3');
    expect(drills.session?.state).toBe('wrong');
    expect(drills.session?.answer?.refutation).toMatch(/^2… Dh4\+?/);
    expect(drills.session?.answer?.refutationUci).toBe('d8h4');
    drills.retry();
    await drills.play('d2d4');
    expect(drills.session?.state).toBe('right');
    expect(drills.currentStored).toMatchObject({ box: 0, lapses: 1 });
    expect(drills.session).toMatchObject({ done: 1, solved: 0 });

    // The best move is accepted without asking the engine; the exercise comes back in 3 days.
    drills.nextDrill();
    await drills.play('e2e4');
    expect(drills.session?.state).toBe('right');
    expect(drills.currentStored?.box).toBe(1);
    expect(Math.round((drills.currentStored!.dueAt - Date.now()) / DAY)).toBe(3);
    expect(drills.session).toMatchObject({ done: 2, solved: 1 });

    drills.nextDrill();
    expect(drills.current).toBeNull();
    drills.quit();
    expect(drills.session).toBeNull();
    expect(drills.due).toEqual([]);
    expect(saved.at(-1)?.map((d) => d.box)).toEqual([1, 0, 0]);
  });

  it('counts showing the solution as a miss', async () => {
    const drills = useDrillsStore();
    drills.drills = [drill(START, { box: 2 })];
    drills.start();
    drills.showHint();
    expect(drills.session?.hintShown).toBe(true);
    drills.reveal();
    expect(drills.session?.state).toBe('revealed');
    expect(drills.currentStored).toMatchObject({ box: 0, lapses: 1 });
    // Playing is no longer possible once the solution is shown.
    await drills.play('e2e4');
    expect(drills.session?.state).toBe('revealed');
  });

  it('adds exercises from a finished game without losing the stored ones', async () => {
    const settings = useSettingsStore();
    const stored = drill(OTHER);
    vi.mocked(settings.loadDrills).mockResolvedValue([stored]);
    const drills = useDrillsStore();
    const issue = {
      fenBefore: START,
      uci: 'f2f3',
      san: 'f3',
      cls: 'blunder',
      bestUci: 'e2e4',
      bestSan: 'e4',
      topLines: [],
      opp: null,
      coach: { status: 'idle', sections: {}, raw: '', error: '' },
    } as unknown as Issue;
    await drills.addFromGame('2026-11-20T10:00:00.000Z', [issue, { ...issue, cls: 'inaccuracy' } as Issue]);
    expect(drills.drills.map((d) => d.fen)).toEqual([OTHER, START]);
    expect(saved.at(-1)).toHaveLength(2);
  });
});
