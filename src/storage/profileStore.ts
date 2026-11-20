import { useCapability, type Db } from '@/platform/claudeRuntime';
import { sanitizeDetails, type GameDetails } from '@/game/details';
import { sanitizeDrills, type Drill } from '@/game/drills';
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
  /** Saves (or replaces) the details of a game, to replay it later. */
  saveDetails(details: GameDetails): Promise<void>;
  loadDetails(key: string): Promise<GameDetails | null>;
  /** Exercises made from the user's mistakes. */
  loadDrills(): Promise<Drill[]>;
  saveDrills(drills: Drill[]): Promise<void>;
}

const SETTINGS_KEY = 'chess-coach.settings';
const GAMES_KEY = 'chess-coach.games';
const DRILLS_KEY = 'chess-coach.drills';
const MAX_LOCAL_GAMES = 50;
/** One localStorage entry per game, so the oldest can be dropped one by one when space runs out. */
const DETAILS_PREFIX = 'chess-coach.details.';

/** Keys of stored game details, oldest first (keys end with the game's ISO date). */
function detailKeys(storage: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(DETAILS_PREFIX)) keys.push(k);
  }
  return keys.sort();
}

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
  async saveDetails(details: GameDetails): Promise<void> {
    const storage = local();
    if (!storage) return;
    const key = DETAILS_PREFIX + details.key;
    const value = JSON.stringify(details);
    try {
      // localStorage holds about 5 MB: when it is full, drop the oldest details (their PGN and statistics
      // stay in the game list) until this game fits.
      for (;;) {
        try {
          storage.setItem(key, value);
          break;
        } catch (e) {
          const oldest = detailKeys(storage).find((k) => k !== key);
          if (!oldest) throw e;
          storage.removeItem(oldest);
        }
      }
      for (const k of detailKeys(storage).slice(0, -MAX_LOCAL_GAMES)) storage.removeItem(k);
    } catch (e) {
      console.warn('game details not saved', e);
    }
  }
  async loadDetails(key: string): Promise<GameDetails | null> {
    return sanitizeDetails(readJson(local(), DETAILS_PREFIX + key));
  }
  async loadDrills(): Promise<Drill[]> {
    return sanitizeDrills(readJson(local(), DRILLS_KEY));
  }
  async saveDrills(drills: Drill[]): Promise<void> {
    writeJson(local(), DRILLS_KEY, drills);
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

  private detailsDoc(key: string) {
    return this.db.doc(`details/${key.replace(/[^\w-]/g, '-')}`);
  }

  async saveDetails(details: GameDetails): Promise<void> {
    await this.fallback.saveDetails(details);
    try {
      await this.detailsDoc(details.key).set({ ...details });
    } catch (e) {
      console.warn('game details save failed', e);
    }
  }

  async loadDetails(key: string): Promise<GameDetails | null> {
    try {
      const snap = await this.detailsDoc(key).get();
      const details = snap.exists ? sanitizeDetails(snap.data()) : null;
      if (details) return details;
    } catch (e) {
      console.warn('game details load failed', e);
    }
    return this.fallback.loadDetails(key);
  }

  async loadDrills(): Promise<Drill[]> {
    try {
      const snap = await this.db.doc('drills/main').get();
      if (snap.exists) return sanitizeDrills(snap.data()?.cards);
    } catch (e) {
      console.warn('drills load failed', e);
    }
    return this.fallback.loadDrills();
  }

  async saveDrills(drills: Drill[]): Promise<void> {
    await this.fallback.saveDrills(drills);
    try {
      await this.db.doc('drills/main').set({ cards: drills });
    } catch (e) {
      console.warn('drills save failed', e);
    }
  }
}

export async function createProfileStore(): Promise<ProfileStore> {
  const localStore = new LocalProfileStore();
  const db = await useCapability('db');
  return db ? new ArtifactProfileStore(db, localStore) : localStore;
}
