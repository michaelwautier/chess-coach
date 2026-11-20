import { MAX_LEVEL, MIN_LEVEL } from '@/engine/levels';
import { TIME_CONTROLS, type Settings } from '@/game/types';

export const DEFAULT_SETTINGS: Settings = {
  color: 'w',
  tc: '10+0',
  level: 9,
  adaptive: true,
  coachOn: 'inaccuracy',
  coachTier: 'default',
  ratingChesscom: null,
  ratingLichess: null,
  provider: 'auto',
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

/** Accepts a rating between 100 and 3500, anything else becomes null. */
export function parseRating(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(n) && n >= 100 && n <= 3500 ? Math.round(n) : null;
}

/** Validates settings read from storage, falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const level = Number(r.level);
  return {
    color: oneOf(r.color, ['w', 'b', 'random'], DEFAULT_SETTINGS.color),
    tc: oneOf(r.tc, Object.keys(TIME_CONTROLS) as Settings['tc'][], DEFAULT_SETTINGS.tc),
    level: Number.isFinite(level)
      ? Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)))
      : DEFAULT_SETTINGS.level,
    adaptive: typeof r.adaptive === 'boolean' ? r.adaptive : DEFAULT_SETTINGS.adaptive,
    coachOn: oneOf(r.coachOn, ['inaccuracy', 'mistake', 'blunder', 'off'], DEFAULT_SETTINGS.coachOn),
    coachTier: oneOf(r.coachTier, ['default', 'quick'], DEFAULT_SETTINGS.coachTier),
    ratingChesscom: parseRating(r.ratingChesscom),
    ratingLichess: parseRating(r.ratingLichess),
    provider: oneOf(
      r.provider,
      ['auto', 'claude-app', 'anthropic', 'openai', 'gemini', 'none'],
      DEFAULT_SETTINGS.provider,
    ),
  };
}

export function ratingText(s: Pick<Settings, 'ratingChesscom' | 'ratingLichess'>): string {
  const parts: string[] = [];
  if (s.ratingChesscom) parts.push(`${s.ratingChesscom} Elo sur chess.com`);
  if (s.ratingLichess) parts.push(`${s.ratingLichess} Elo sur Lichess`);
  return parts.length ? parts.join(' et ') : 'non précisé';
}
