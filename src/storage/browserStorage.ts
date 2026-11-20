/** JSON helpers around Web Storage; storage can be missing or throw (private mode, sandboxed frames). */
export function readJson<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(storage: Storage | undefined, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep the value in memory only */
  }
}

export function removeKey(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const local = (): Storage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage;
export const session = (): Storage | undefined =>
  typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
