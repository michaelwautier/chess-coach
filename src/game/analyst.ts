import type { Engine } from '@/engine/engine';
import type { InfoLine, SearchResult } from '@/engine/uci';

export interface Analysis {
  depth: number;
  lines: InfoLine[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Full-strength analysis used by the coach: analyses the user's position while they think, and
 * keeps the deepest result per FEN.
 */
export class Analyst {
  private cache = new Map<string, Analysis>();
  private current: { fen: string; id: number; promise: Promise<SearchResult>; done: boolean } | null = null;

  constructor(private readonly engine: Engine) {}

  reset(): void {
    this.stop();
    this.cache.clear();
    this.current = null;
  }

  get(fen: string): Analysis | undefined {
    return this.cache.get(fen);
  }

  private store(fen: string, result: Analysis): void {
    if (!result.lines.length) return;
    const prev = this.cache.get(fen);
    if (!prev || result.depth >= prev.depth) this.cache.set(fen, result);
  }

  /** Starts a background analysis (3 lines, up to depth 16) of the position the user is thinking about. */
  start(fen: string): void {
    const cached = this.cache.get(fen);
    if (cached && cached.depth >= 16) return;
    if (this.current && this.current.fen === fen && !this.current.done) return;
    this.stop();
    const search = this.engine.search(fen, 'go depth 16 movetime 20000', {
      multipv: 3,
      onInfo: (_info, latest) => {
        const lines = [...latest.values()].sort((a, b) => a.multipv - b.multipv);
        this.store(fen, { depth: Math.min(...lines.map((l) => l.depth)), lines });
      },
    });
    const entry = { fen, id: search.id, promise: search.promise, done: false };
    this.current = entry;
    void search.promise.then((r) => {
      entry.done = true;
      this.store(fen, r);
    });
  }

  stop(): void {
    if (this.current && !this.current.done) this.engine.stop(this.current.id);
  }

  /** Analysis of `fen` with at least `minDepth`, stopping the background search if it is the one running. */
  async ensure(fen: string, minDepth: number): Promise<Analysis> {
    const c = this.current;
    if (c && c.fen === fen && !c.done) {
      this.engine.stop(c.id);
      await c.promise;
    }
    let a = this.cache.get(fen);
    if (!a || a.depth < minDepth) {
      const r = await this.engine.search(fen, `go depth ${minDepth + 1} movetime 4000`, { multipv: 3 })
        .promise;
      this.store(fen, r);
      a = this.cache.get(fen);
    }
    return a ?? { depth: 0, lines: [] };
  }

  /** Waits (without stopping) for the background analysis to reach `depth`, up to `timeoutMs`. */
  async waitForDepth(fen: string, depth: number, timeoutMs: number): Promise<Analysis> {
    const t0 = performance.now();
    while (performance.now() - t0 < timeoutMs) {
      const a = this.cache.get(fen);
      if (a && a.depth >= depth) return a;
      if (this.current?.fen === fen && this.current.done) break;
      await sleep(150);
    }
    const a = this.cache.get(fen);
    return a && a.depth >= 8 ? a : this.ensure(fen, 10);
  }

  /** Single-line evaluation of a position (used after the user's move). */
  async evaluate(fen: string): Promise<InfoLine | null> {
    const r = await this.engine.search(fen, 'go depth 12 movetime 2500', { multipv: 1 }).promise;
    return r.lines[0] ?? null;
  }
}
