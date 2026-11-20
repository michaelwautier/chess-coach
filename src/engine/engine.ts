import { collectLines, parseInfo, type InfoLine, type SearchResult } from './uci';

export interface EngineBuild {
  name: string;
  js: string;
  /** URL of the wasm binary; null for the asm.js build. */
  wasm: string | null;
  timeoutMs: number;
  /** Start the worker from a blob URL (fallback for hosts refusing file-URL workers). */
  blob?: boolean;
}

export interface SearchOptions {
  multipv?: number;
  onInfo?: (info: InfoLine, latest: Map<number, InfoLine>) => void;
}

export interface SearchHandle {
  id: number;
  promise: Promise<SearchResult>;
}

type Listener = (line: string) => void;

/**
 * UCI wrapper around a Stockfish web worker. Searches are serialized: each one waits for the
 * previous one's "bestmove".
 */
export class Engine {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private currentId = 0;
  private runningId = 0;
  private cancelled = new Set<number>();
  build: EngineBuild | null = null;

  constructor(readonly label: string) {}

  async init(builds: EngineBuild[], onStatus?: (text: string) => void): Promise<EngineBuild> {
    let lastError: unknown = null;
    for (const build of builds) {
      try {
        onStatus?.(`Chargement du moteur (${build.name})…`);
        await this.start(build);
        this.build = build;
        return build;
      } catch (e) {
        lastError = e;
        console.warn(`[${this.label}] ${build.name}${build.blob ? ' (blob)' : ''} failed`, e);
        this.terminate();
      }
    }
    throw lastError ?? new Error('No engine build could start');
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
  }

  private async start(build: EngineBuild): Promise<void> {
    let src = build.js;
    if (build.blob) {
      const code = await (await fetch(build.js)).text();
      src = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    }
    const url = build.wasm ? `${src}#${encodeURIComponent(build.wasm)}` : src;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => finish(new Error('Engine start timeout')), build.timeoutMs);
      const worker = new Worker(url);
      this.worker = worker;
      worker.onerror = (e) => finish(new Error(e.message || 'Worker error'));
      worker.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data !== 'string') return;
        for (const raw of ev.data.split('\n')) {
          const line = raw.trim();
          if (line) for (const l of [...this.listeners]) l(line);
        }
      };
      const onLine: Listener = (line) => {
        if (line === 'uciok') {
          this.send('setoption name Hash value 16');
          this.send('isready');
        } else if (line === 'readyok') {
          this.listeners.delete(onLine);
          finish();
        }
      };
      this.listeners.add(onLine);
      this.send('uci');
    });
  }

  private send(cmd: string): void {
    this.worker?.postMessage(cmd);
  }

  /** Resets the engine between games. */
  newGame(): Promise<void> {
    const run = () =>
      new Promise<void>((resolve) => {
        const onLine: Listener = (line) => {
          if (line === 'readyok') {
            this.listeners.delete(onLine);
            resolve();
          }
        };
        this.listeners.add(onLine);
        this.send('ucinewgame');
        this.send('isready');
      });
    const p = this.queue.then(run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  search(fen: string, goCommand: string, { multipv = 1, onInfo }: SearchOptions = {}): SearchHandle {
    const id = ++this.currentId;
    const run = () =>
      new Promise<SearchResult>((resolve) => {
        if (!this.worker) {
          resolve({ bestmove: null, lines: [], depth: 0 });
          return;
        }
        this.runningId = id;
        const byDepth = new Map<number, Map<number, InfoLine>>();
        const latest = new Map<number, InfoLine>();
        const handler: Listener = (line) => {
          if (line.startsWith('info ')) {
            const info = parseInfo(line);
            if (!info) return;
            latest.set(info.multipv, info);
            if (!byDepth.has(info.depth)) byDepth.set(info.depth, new Map());
            byDepth.get(info.depth)!.set(info.multipv, info);
            onInfo?.(info, latest);
          } else if (line.startsWith('bestmove')) {
            this.listeners.delete(handler);
            this.runningId = 0;
            const best = line.split(' ')[1];
            const lines = collectLines(byDepth, latest);
            const depth = lines.length ? Math.min(...lines.map((l) => l.depth)) : 0;
            resolve({ bestmove: best && best !== '(none)' ? best : null, lines, depth });
          }
        };
        this.listeners.add(handler);
        this.send(`setoption name MultiPV value ${multipv}`);
        this.send(`position fen ${fen}`);
        // A search stopped before it started still returns a (shallow) result.
        this.send(this.cancelled.has(id) ? 'go depth 1' : goCommand);
        this.cancelled.delete(id);
      });
    const promise = this.queue.then(run);
    this.queue = promise.catch(() => undefined);
    return { id, promise };
  }

  /** Stops a search: immediately if running, or makes it shallow if still queued. */
  stop(id: number): void {
    if (this.runningId === id) this.send('stop');
    else if (id > this.runningId) this.cancelled.add(id);
  }
}

/** Engine builds to try, in order: wasm, wasm from a blob, then the (slow) asm.js fallback. */
export function engineBuilds(base: string = document.baseURI): EngineBuild[] {
  const url = (f: string) => new URL(`stockfish/${f}`, base).href;
  const wasm = { name: 'Stockfish 19 lite', js: url('sf.js'), wasm: url('sf.wasm'), timeoutMs: 25000 };
  const asm = { name: 'Stockfish 19 asm.js (lent)', js: url('sf-asm.js'), wasm: null, timeoutMs: 45000 };
  return [wasm, { ...wasm, blob: true }, asm, { ...asm, blob: true }];
}
