import type { Color, MoveClass, PieceType } from './types';

export const FILES = 'abcdefgh';

export const PIECE_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** French piece names, used in coach prompts and UI. */
export const PIECE_NAME: Record<PieceType, string> = {
  k: 'Roi',
  q: 'Dame',
  r: 'Tour',
  b: 'Fou',
  n: 'Cavalier',
  p: 'Pion',
};
export const PIECE_NAME_PLURAL: Record<PieceType, string> = {
  k: 'Roi',
  q: 'Dames',
  r: 'Tours',
  b: 'Fous',
  n: 'Cavaliers',
  p: 'Pions',
};
/** Feminine nouns need agreement in French ("Dame attaquée"). */
export const isFeminine = (t: PieceType): boolean => t === 'q' || t === 'r';

export const COLOR_NAME: Record<Color, string> = { w: 'Blancs', b: 'Noirs' };

export const CLASS_INFO: Record<MoveClass, { label: string; mark: string; rank: number; noun: string }> = {
  inaccuracy: { label: 'Imprécision', mark: '?!', rank: 1, noun: 'imprécision' },
  mistake: { label: 'Erreur', mark: '?', rank: 2, noun: 'erreur' },
  blunder: { label: 'Gaffe', mark: '??', rank: 3, noun: 'gaffe' },
};

export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
export const colorName = (c: Color): string => COLOR_NAME[c];

/** 'claire' or 'sombre' (light or dark square). a1 is dark. */
export const squareShade = (sq: string): 'claire' | 'sombre' =>
  (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 1 ? 'sombre' : 'claire';
