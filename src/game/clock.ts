import type { Color } from '@/chess/types';

/** Chess clock with increment. Time is measured with a monotonic clock. */
export class ChessClock {
  remainingMs: Record<Color, number>;
  running: Color | null = null;
  private since = 0;

  constructor(
    readonly initialMs: number,
    readonly incrementMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.remainingMs = { w: initialMs, b: initialMs };
  }

  remaining(color: Color): number {
    const base = this.remainingMs[color];
    return this.running === color ? base - (this.now() - this.since) : base;
  }

  start(color: Color): void {
    this.stop();
    this.running = color;
    this.since = this.now();
  }

  stop(): void {
    if (!this.running) return;
    this.remainingMs[this.running] = this.remaining(this.running);
    this.running = null;
  }

  addIncrement(color: Color): void {
    this.remainingMs[color] += this.incrementMs;
  }

  /** The color whose time just ran out, if any. */
  flagged(): Color | null {
    return this.running && this.remaining(this.running) <= 0 ? this.running : null;
  }
}

export function formatClock(ms: number): string {
  const t = Math.max(0, ms);
  if (t < 10000) return (t / 1000).toFixed(1);
  const s = Math.ceil(t / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
