import { SOUND_SETS } from '@/audio/sounds';
import { BOARD_THEMES, DEFAULT_BOARD_THEME, DEFAULT_PIECE_SET, PIECE_SETS } from '@/appearance/themes';
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
  boardTheme: DEFAULT_BOARD_THEME.id,
  boardLight: DEFAULT_BOARD_THEME.light,
  boardDark: DEFAULT_BOARD_THEME.dark,
  pieceSet: DEFAULT_PIECE_SET,
  soundSet: 'wood',
  soundVolume: 70,
};

const isHexColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

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
    ...sanitizeBoard(r),
    pieceSet: oneOf(
      r.pieceSet,
      PIECE_SETS.map((p) => p.id),
      DEFAULT_SETTINGS.pieceSet,
    ),
    soundSet: oneOf(
      r.soundSet,
      SOUND_SETS.map((x) => x.id),
      DEFAULT_SETTINGS.soundSet,
    ),
    soundVolume:
      typeof r.soundVolume === 'number' && Number.isFinite(r.soundVolume)
        ? Math.max(0, Math.min(100, Math.round(r.soundVolume)))
        : DEFAULT_SETTINGS.soundVolume,
  };
}

/** A preset theme always uses its own colors; custom colors must be valid hex colors. */
function sanitizeBoard(
  r: Record<string, unknown>,
): Pick<Settings, 'boardTheme' | 'boardLight' | 'boardDark'> {
  const preset = BOARD_THEMES.find((t) => t.id === r.boardTheme);
  if (preset) return { boardTheme: preset.id, boardLight: preset.light, boardDark: preset.dark };
  if (r.boardTheme === 'custom' && isHexColor(r.boardLight) && isHexColor(r.boardDark)) {
    return {
      boardTheme: 'custom',
      boardLight: r.boardLight.toLowerCase(),
      boardDark: r.boardDark.toLowerCase(),
    };
  }
  return {
    boardTheme: DEFAULT_BOARD_THEME.id,
    boardLight: DEFAULT_BOARD_THEME.light,
    boardDark: DEFAULT_BOARD_THEME.dark,
  };
}

export function ratingText(s: Pick<Settings, 'ratingChesscom' | 'ratingLichess'>): string {
  const parts: string[] = [];
  if (s.ratingChesscom) parts.push(`${s.ratingChesscom} Elo sur chess.com`);
  if (s.ratingLichess) parts.push(`${s.ratingLichess} Elo sur Lichess`);
  return parts.length ? parts.join(' et ') : 'non précisé';
}
