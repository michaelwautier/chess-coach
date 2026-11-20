import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { moveSound } from '@/audio/sounds';
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/storage/settings';

/** Plays `moves` (SAN) from `fen` and returns the sound of the last one. */
function soundOf(moves: string[], fen?: string) {
  const chess = new Chess(fen);
  let last = null;
  for (const m of moves) last = chess.move(m);
  return moveSound(last!);
}

describe('move sounds', () => {
  it('tells a quiet move from a capture', () => {
    expect(soundOf(['e4'])).toBe('move');
    expect(soundOf(['e4', 'd5', 'exd5'])).toBe('capture');
  });

  it('counts en passant as a capture', () => {
    expect(soundOf(['e4', 'a6', 'e5', 'd5', 'exd6'])).toBe('capture');
  });

  it('recognises castling and promotion', () => {
    expect(soundOf(['O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe('castle');
    expect(soundOf(['O-O-O'], 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1')).toBe('castle');
    expect(soundOf(['a8=Q'], '8/P7/7k/8/8/8/8/K7 w - - 0 1')).toBe('promote');
  });

  it('puts check first, even on a capture or a mate', () => {
    expect(soundOf(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#'])).toBe('check');
    expect(soundOf(['Bb5+'], 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')).toBe('check');
  });
});

describe('sound settings', () => {
  it('defaults to the wood set at 70 % and validates both fields', () => {
    expect(sanitizeSettings({})).toMatchObject({ soundSet: 'wood', soundVolume: 70 });
    expect(sanitizeSettings({ soundSet: 'creamy', soundVolume: 140 })).toMatchObject({
      soundSet: 'creamy',
      soundVolume: 100,
    });
    expect(sanitizeSettings({ soundSet: 'off' }).soundSet).toBe('off');
    expect(sanitizeSettings({ soundSet: 'piano' }).soundSet).toBe(DEFAULT_SETTINGS.soundSet);
    expect(sanitizeSettings({ soundVolume: '30' }).soundVolume).toBe(DEFAULT_SETTINGS.soundVolume);
    expect(sanitizeSettings({ soundVolume: -5 }).soundVolume).toBe(0);
  });
});
