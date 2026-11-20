import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { SETTINGS_SAVE_DELAY_MS, useSettingsStore } from '@/stores/settings';

/** In-memory Web Storage, so the store reads and writes as it would in a browser. */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
}

let local: MemoryStorage;
let session: MemoryStorage;

/** A fresh store, as after a page reload: same storage, new Pinia. */
async function reload() {
  setActivePinia(createPinia());
  const store = useSettingsStore();
  await store.init();
  return store;
}

describe('settings store persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    local = new MemoryStorage();
    session = new MemoryStorage();
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', session);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps setup choices across a reload without starting a game', async () => {
    const store = await reload();
    store.settings.color = 'b';
    store.settings.tc = '15+10';
    store.settings.level = 14;
    store.settings.ratingLichess = 1600;
    await nextTick();
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS);

    const again = await reload();
    expect(again.settings).toMatchObject({ color: 'b', tc: '15+10', level: 14, ratingLichess: 1600 });
  });

  it('writes a burst of changes once, after the last one', async () => {
    const store = await reload();
    const writes = vi.spyOn(local, 'setItem');
    for (let level = 10; level <= 15; level++) {
      store.settings.level = level;
      await nextTick();
      await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS / 3);
    }
    expect(writes).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS);
    expect(writes).toHaveBeenCalledTimes(1);
    expect(JSON.parse(local.getItem('chess-coach.settings')!).level).toBe(15);
  });

  it('does not write the settings it just loaded', async () => {
    local.setItem('chess-coach.settings', JSON.stringify({ color: 'b' }));
    const writes = vi.spyOn(local, 'setItem');
    await reload();
    await vi.advanceTimersByTimeAsync(SETTINGS_SAVE_DELAY_MS * 2);
    expect(writes).not.toHaveBeenCalled();
  });

  it('saves an API key as it is typed, in the tab or on the device', async () => {
    const store = await reload();
    store.providers.anthropic.apiKey = 'sk-ant-test';
    await nextTick();
    expect(session.getItem('chess-coach.providers')).toContain('sk-ant-test');
    expect(local.getItem('chess-coach.providers')).toBeNull();

    store.rememberKeys = true;
    await nextTick();
    expect(local.getItem('chess-coach.providers')).toContain('sk-ant-test');
    expect(session.getItem('chess-coach.providers')).toBeNull();
    expect((await reload()).providers.anthropic.apiKey).toBe('sk-ant-test');
  });
});
