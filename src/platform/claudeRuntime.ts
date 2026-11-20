/**
 * Access to the capabilities claude.ai gives a page published as an artifact (`window.claude`).
 * Everything resolves to null elsewhere, so the app works the same outside Claude.
 */

export interface SampleError {
  code: string;
  message: string;
  text?: string;
}

export interface SampleFunction {
  (
    input: string,
    options?: {
      modelTier?: 'quick' | 'default';
      signal?: AbortSignal;
      onText?: (u: { text: string; delta: string }) => void;
    },
  ): Promise<{ text: string; truncated: boolean }>;
}

export interface DocSnapshot {
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export interface DbDocument {
  get(): Promise<DocSnapshot>;
  set(data: Record<string, unknown>): Promise<void>;
}

export interface DbQuery {
  orderBy(field: string, dir?: 'asc' | 'desc'): DbQuery;
  limit(n: number): DbQuery;
  get(): Promise<{ docs: DocSnapshot[] }>;
}

export interface DbCollection extends DbQuery {
  add(data: Record<string, unknown>): Promise<unknown>;
}

export interface Db {
  doc(path: string): DbDocument;
  collection(path: string): DbCollection;
}

interface ClaudeRuntime {
  use(name: 'sample'): Promise<SampleFunction | null>;
  use(name: 'db'): Promise<Db | null>;
  use(name: string): Promise<unknown>;
}

declare global {
  interface Window {
    claude?: ClaudeRuntime;
  }
}

export const insideClaude = (): boolean => typeof window !== 'undefined' && !!window.claude?.use;

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);

export async function useCapability(name: 'sample'): Promise<SampleFunction | null>;
export async function useCapability(name: 'db'): Promise<Db | null>;
export async function useCapability(name: string): Promise<unknown> {
  if (!insideClaude()) return null;
  try {
    return await withTimeout(window.claude!.use(name), 11000);
  } catch {
    return null;
  }
}
