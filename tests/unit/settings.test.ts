import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseRating, ratingText, sanitizeSettings } from '@/storage/settings';

describe('settings', () => {
  it('falls back to defaults for invalid values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ tc: '3+2', level: 42, color: 'b', provider: 'gemini' })).toMatchObject({
      tc: DEFAULT_SETTINGS.tc,
      level: 20,
      color: 'b',
      provider: 'gemini',
    });
  });

  it('parses ratings', () => {
    expect(parseRating('1575')).toBe(1575);
    expect(parseRating('')).toBeNull();
    expect(parseRating(42)).toBeNull();
    expect(ratingText({ ratingChesscom: 1250, ratingLichess: null })).toBe('1250 Elo sur chess.com');
    expect(ratingText({ ratingChesscom: null, ratingLichess: null })).toBe('non précisé');
  });
});
