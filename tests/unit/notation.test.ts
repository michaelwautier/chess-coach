import { describe, expect, it } from 'vitest';
import { formatLine, frSan, movesText, uciLineToSan } from '@/chess/notation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('notation', () => {
  it('converts SAN to French piece letters', () => {
    expect(frSan('Nf3')).toBe('Cf3');
    expect(frSan('Qxd8+')).toBe('Dxd8+');
    expect(frSan('Kxe2')).toBe('Rxe2');
    expect(frSan('Rb1')).toBe('Tb1');
    expect(frSan('exd8=Q#')).toBe('exd8=D#');
    expect(frSan('O-O')).toBe('O-O');
    expect(frSan('bxc3')).toBe('bxc3');
  });

  it('converts a UCI line to SAN and stops at an illegal move', () => {
    expect(uciLineToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
    expect(uciLineToSan(START, ['e2e4', 'e2e4', 'g1f3'])).toEqual(['e4']);
  });

  it('numbers moves from a position with Black to move', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatLine(fen, ['e5', 'Nf3', 'Nc6'])).toBe('1… e5 2. Cf3 Cc6');
  });

  it('keeps the last plies of a game with correct numbering', () => {
    expect(movesText(['e4', 'e5', 'Nf3'])).toBe('1. e4 e5 2. Cf3');
    expect(movesText(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 2)).toBe('… 2… Cc6 3. Fb5');
  });
});
