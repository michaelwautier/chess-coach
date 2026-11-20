import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, PIECE_SETS, pieceSetCss } from '@/appearance/themes';
import { sanitizeSettings } from '@/storage/settings';

describe('appearance', () => {
  it('ships the 12 images of every piece set', () => {
    for (const set of PIECE_SETS) {
      for (const file of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP']) {
        expect(existsSync(`public/pieces/${set.id}/${file}.svg`), `${set.id}/${file}`).toBe(true);
      }
    }
  });

  it('builds piece CSS relative to the base URL', () => {
    const css = pieceSetCss('merida', './');
    expect(css).toContain(".cg-wrap piece.knight.black { background-image: url('./pieces/merida/bN.svg'); }");
    expect(css.split('\n')).toHaveLength(12);
  });

  it('sanitizes board colors and piece sets', () => {
    const green = BOARD_THEMES.find((t) => t.id === 'green')!;
    expect(sanitizeSettings({ boardTheme: 'green', boardLight: '#000000' })).toMatchObject({
      boardLight: green.light,
      boardDark: green.dark,
    });
    expect(
      sanitizeSettings({ boardTheme: 'custom', boardLight: '#ABCDEF', boardDark: '#123456' }),
    ).toMatchObject({
      boardTheme: 'custom',
      boardLight: '#abcdef',
      boardDark: '#123456',
    });
    expect(
      sanitizeSettings({ boardTheme: 'custom', boardLight: 'red', boardDark: '#123456' }).boardTheme,
    ).toBe('brown');
    expect(sanitizeSettings({ pieceSet: 'unknown' }).pieceSet).toBe('cburnett');
    expect(sanitizeSettings({ pieceSet: 'fantasy' }).pieceSet).toBe('fantasy');
  });
});
