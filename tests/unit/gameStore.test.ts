import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '@/engine/uci';
import { useDialogStore } from '@/stores/dialog';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';

/**
 * Game flow around "Continuer" and its undo, with fake engines: the player engine's searches resolve
 * when the test says so (or when stopped), and the analyst judges 1. f3 as a blunder and 1. e4 as best.
 */
const fake = vi.hoisted(() => ({
  nextId: 0,
  searches: [] as { id: number; resolve: () => void }[],
  stopped: [] as number[],
}));

vi.mock('@/engine/engine', () => {
  const reply = (): SearchResult => ({
    bestmove: 'e7e5',
    lines: [{ depth: 10, multipv: 1, cp: 0, mate: null, pv: ['e7e5'] }],
    depth: 10,
  });
  class Engine {
    constructor(readonly label: string) {}
    async init() {
      return { name: 'fake', js: '', wasm: null, timeoutMs: 0 };
    }
    async newGame() {}
    search() {
      const id = ++fake.nextId;
      const promise = new Promise<SearchResult>((resolve) =>
        fake.searches.push({ id, resolve: () => resolve(reply()) }),
      );
      return { id, promise };
    }
    stop(id: number) {
      fake.stopped.push(id);
      fake.searches.find((s) => s.id === id)?.resolve();
    }
  }
  return { Engine, engineBuilds: () => [] };
});

vi.mock('@/game/analyst', () => {
  const line = (cp: number, pv: string[]) => ({ depth: 16, multipv: 1, cp, mate: null, pv });
  class Analyst {
    reset() {}
    start() {}
    stop() {}
    get() {
      return undefined;
    }
    async ensure() {
      return { depth: 16, lines: [line(20, ['e2e4', 'e7e5'])] };
    }
    async evaluate() {
      // Black's view after 1. f3: clearly better for Black, so 1. f3 is a blunder.
      return line(500, ['e7e5']);
    }
  }
  return { Analyst };
});

vi.mock('@/coach/runCoach', () => ({ runCoach: async () => {} }));

/** Lets the player engine answer its latest search, then waits past its simulated thinking time. */
async function engineReplies(): Promise<void> {
  fake.searches[fake.searches.length - 1].resolve();
  await vi.advanceTimersByTimeAsync(2000);
}

async function startGame() {
  const settings = useSettingsStore();
  Object.assign(settings.settings, { color: 'w', tc: '5+3', level: 9, coachOn: 'inaccuracy' });
  const game = useGameStore();
  await game.initEngines();
  await game.newGame();
  await game.onUserMove('f2', 'f3');
  expect(game.phase).toBe('coaching');
  return game;
}

const clocks = (game: ReturnType<typeof useGameStore>) => ({ w: game.clockMs('w'), b: game.clockMs('b') });

describe('undoing "Continuer"', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'],
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setActivePinia(createPinia());
    fake.searches = [];
    fake.stopped = [];
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops the engine and restores the coaching pause while the engine thinks', async () => {
    const game = await startGame();
    const issue = game.currentIssue!;
    const pgn = game.chess.pgn();
    const paused = clocks(game);

    game.continueGame();
    expect(game.phase).toBe('engine');
    expect(game.canUndoContinue).toBe(true);
    expect(game.clockMs('w')).toBe(paused.w + 3000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(game.clockMs('b')).toBe(paused.b - 1000);

    game.undoContinue();
    expect(game.phase).toBe('coaching');
    expect(issue.status).toBe('open');
    expect(game.canUndoContinue).toBe(false);
    expect(fake.stopped).toEqual([fake.searches[0].id]);
    expect(game.clockRunning).toBeNull();
    expect(clocks(game)).toEqual(paused);
    expect(game.board.fen).toBe(issue.fenAfter);

    // The stopped search's move is never played and the paused clock does not run.
    await vi.advanceTimersByTimeAsync(10000);
    expect(game.history).toHaveLength(1);
    expect(game.chess.pgn()).toBe(pgn);
    expect(clocks(game)).toEqual(paused);

    // Retry works as from any coaching pause, and statistics keep the first attempt.
    game.retryMove();
    expect(game.phase).toBe('user');
    expect(game.history).toHaveLength(0);
    await game.onUserMove('e2', 'e4');
    await engineReplies();
    expect(game.chess.pgn()).toMatch(/\n1\. e4 e5 \*$/);
    const resigned = game.resign();
    useDialogStore().answer(true);
    await resigned;
    expect(game.result?.stats.counts.blunder).toBe(1);
    expect(game.result?.stats.retried).toBe(1);
  });

  it('takes back the engine reply when the user undoes before moving again', async () => {
    const game = await startGame();
    const issue = game.currentIssue!;
    const pgn = game.chess.pgn();
    const paused = clocks(game);

    game.continueGame();
    await engineReplies();
    expect(game.phase).toBe('user');
    expect(game.history).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(game.canUndoContinue).toBe(true);

    game.undoContinue();
    expect(game.phase).toBe('coaching');
    expect(issue.status).toBe('open');
    expect(game.history).toHaveLength(1);
    expect(game.chess.pgn()).toBe(pgn);
    expect(game.clockRunning).toBeNull();
    expect(clocks(game)).toEqual(paused);

    // Continuing again gives exactly one engine reply.
    game.continueGame();
    await engineReplies();
    expect(game.history.map((m) => m.san)).toEqual(['f3', 'e5']);
    expect(game.phase).toBe('user');

    // Once the user has moved again, "Continuer" can no longer be undone.
    await game.onUserMove('e2', 'e4');
    expect(game.canUndoContinue).toBe(false);
    game.undoContinue();
    expect(game.history).toHaveLength(3);
  });

  it('never plays the move of an engine turn that was undone', async () => {
    const game = await startGame();
    game.continueGame();
    // The engine has found its move and waits out its simulated thinking time.
    fake.searches[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(game.phase).toBe('engine');
    game.undoContinue();
    game.retryMove();
    await game.onUserMove('e2', 'e4');
    expect(game.phase).toBe('engine');
    await vi.advanceTimersByTimeAsync(10000);
    expect(game.history.map((m) => m.san)).toEqual(['e4']);
    await engineReplies();
    expect(game.history.map((m) => m.san)).toEqual(['e4', 'e5']);
  });

  it('ignores the stopped search when "Continuer" is pressed again right away', async () => {
    const game = await startGame();
    game.continueGame();
    game.undoContinue();
    game.continueGame();
    await engineReplies();
    expect(game.history.map((m) => m.san)).toEqual(['f3', 'e5']);
    expect(game.phase).toBe('user');
  });

  it('keeps the solution on the board if it was shown before continuing', async () => {
    const game = await startGame();
    const issue = game.currentIssue!;
    game.showSolution();
    game.continueGame();
    game.undoContinue();
    expect(game.board.fen).toBe(issue.fenBefore);
    expect(game.shapes).toHaveLength(2);
  });
});
