import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameDetails } from '@/game/details';
import { createProfileStore } from '@/storage/profileStore';

/** In-memory Web Storage that refuses writes beyond `quota` characters, like a full localStorage. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}
  get length(): number {
    return this.data.size;
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    const used = [...this.data].reduce((n, [key, val]) => n + (key === k ? 0 : key.length + val.length), 0);
    if (used + k.length + v.length > this.quota) throw new DOMException('full', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
  clear(): void {
    this.data.clear();
  }
  keys(): string[] {
    return [...this.data.keys()];
  }
}

const details = (key: string, padding = ''): GameDetails => ({
  version: 1,
  key,
  stats: {
    counts: { inaccuracy: 0, mistake: 0, blunder: 0 },
    moves: 0,
    extraErrors: 0,
    retried: 0,
    rewoundBlunders: 0,
    accuracy: null,
    accuracyFinal: null,
    oppErrors: 0,
    oppMissed: 0,
  },
  issues: [],
  engineErrors: [],
  summary: { status: 'done', sections: {}, raw: padding, error: '' },
});

const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}T10:00:00.000Z`;

describe('local game details', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('saves, replaces and reads back the details of a game', async () => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const store = await createProfileStore();
    await store.saveDetails(details(day(1), 'first'));
    await store.saveDetails(details(day(1), 'second'));
    expect((await store.loadDetails(day(1)))?.summary.raw).toBe('second');
    expect(await store.loadDetails(day(2))).toBeNull();
  });

  it('drops the oldest details when storage is full', async () => {
    const size = JSON.stringify(details(day(1), 'x'.repeat(1000))).length + 60;
    storage = new MemoryStorage(size * 3);
    vi.stubGlobal('localStorage', storage);
    storage.setItem('chess-coach.settings', '{}');
    const store = await createProfileStore();
    for (const d of [1, 2, 3, 4]) await store.saveDetails(details(day(d), 'x'.repeat(1000)));
    expect(await store.loadDetails(day(1))).toBeNull();
    expect(await store.loadDetails(day(4))).not.toBeNull();
    // Other data is never removed to make room.
    expect(storage.getItem('chess-coach.settings')).toBe('{}');
  });

  it('keeps the details of the 50 most recent games', async () => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    const store = await createProfileStore();
    for (let d = 1; d <= 52; d++) await store.saveDetails(details(`2026-${String(d).padStart(3, '0')}`));
    const kept = storage.keys().filter((k) => k.startsWith('chess-coach.details.'));
    expect(kept).toHaveLength(50);
    expect(await store.loadDetails('2026-001')).toBeNull();
    expect(await store.loadDetails('2026-052')).not.toBeNull();
  });
});
