import { useCapability, type Db } from '@/platform/claudeRuntime';
import type { GameRecord, Settings } from '@/game/types';
import { local, readJson, writeJson } from './browserStorage';

/**
 * Settings and game history. Uses the artifact database when the app runs as a claude.ai artifact
 * (synced across devices), localStorage otherwise. API keys are never stored here.
 */
export interface ProfileStore {
  loadSettings(): Promise<unknown>;
  saveSettings(settings: Settings): Promise<void>;
  addGame(game: GameRecord): Promise<void>;
  recentGames(limit: number): Promise<GameRecord[]>;
}

const SETTINGS_KEY = 'chess-coach.settings';
const GAMES_KEY = 'chess-coach.games';
const MAX_LOCAL_GAMES = 50;

class LocalProfileStore implements ProfileStore {
  async loadSettings(): Promise<unknown> {
    return readJson(local(), SETTINGS_KEY);
  }
  async saveSettings(settings: Settings): Promise<void> {
    writeJson(local(), SETTINGS_KEY, settings);
  }
  async addGame(game: GameRecord): Promise<void> {
    const games = readJson<GameRecord[]>(local(), GAMES_KEY) ?? [];
    writeJson(local(), GAMES_KEY, [game, ...games].slice(0, MAX_LOCAL_GAMES));
  }
  async recentGames(limit: number): Promise<GameRecord[]> {
    return (readJson<GameRecord[]>(local(), GAMES_KEY) ?? []).slice(0, limit);
  }
}

class ArtifactProfileStore implements ProfileStore {
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly db: Db,
    private readonly fallback: LocalProfileStore,
  ) {}

  async loadSettings(): Promise<unknown> {
    try {
      const snap = await this.db.doc('profile/main').get();
      if (snap.exists) return snap.data();
    } catch (e) {
      console.warn('settings load failed', e);
    }
    return this.fallback.loadSettings();
  }

  saveSettings(settings: Settings): Promise<void> {
    void this.fallback.saveSettings(settings);
    // One write at a time on the same document.
    const next = this.writes.then(() => this.db.doc('profile/main').set({ ...settings }));
    this.writes = next.catch((e) => console.warn('settings save failed', e));
    return this.writes.then(() => undefined);
  }

  async addGame(game: GameRecord): Promise<void> {
    await this.fallback.addGame(game);
    try {
      await this.db.collection('games').add({ ...game });
    } catch (e) {
      console.warn('game save failed', e);
    }
  }

  async recentGames(limit: number): Promise<GameRecord[]> {
    try {
      const snap = await this.db.collection('games').orderBy('date', 'desc').limit(limit).get();
      return snap.docs.map((d) => d.data() as unknown as GameRecord);
    } catch (e) {
      console.warn('games load failed', e);
      return this.fallback.recentGames(limit);
    }
  }
}

export async function createProfileStore(): Promise<ProfileStore> {
  const localStore = new LocalProfileStore();
  const db = await useCapability('db');
  return db ? new ArtifactProfileStore(db, localStore) : localStore;
}
