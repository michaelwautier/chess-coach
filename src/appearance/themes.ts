/** Piece sets shipped in public/pieces (see public/pieces/CREDITS.md for sources and licenses). */
export interface PieceSet {
  id: string;
  label: string;
  author: string;
  license: string;
}

export const PIECE_SETS: readonly PieceSet[] = [
  { id: 'cburnett', label: 'Classique', author: 'Colin M.L. Burnett', license: 'GPLv2+' },
  { id: 'merida', label: 'Merida', author: 'Armando Hernandez Marroquin', license: 'GPLv2+' },
  { id: 'chessnut', label: 'Chessnut', author: 'Alexis Luengas', license: 'Apache 2.0' },
  { id: 'mpchess', label: 'MPChess', author: 'Maxime Chupin', license: 'GPLv3+' },
  { id: 'celtic', label: 'Celtic', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'fantasy', label: 'Fantasy', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'spatial', label: 'Spatial', author: 'Maurizio Monge', license: 'MIT' },
  { id: 'papercut', label: 'Papercut', author: 'Nikolay Anzarov', license: 'CC BY 4.0' },
  { id: 'rhosgfx', label: 'RhosGFX', author: 'RhosGFX', license: 'CC0 1.0' },
  { id: 'kiwen-suwi', label: 'Kiwen-suwi', author: 'neverRare', license: 'CC BY 4.0' },
  { id: 'totoy', label: 'Totoy', author: 'Kosal Sen', license: 'CC BY 4.0' },
  { id: 'shapes', label: 'Formes', author: 'flugsio', license: 'CC BY-SA 4.0' },
];

export const DEFAULT_PIECE_SET = 'cburnett';

export interface BoardTheme {
  id: string;
  label: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: readonly BoardTheme[] = [
  { id: 'brown', label: 'Bois', light: '#f0d9b5', dark: '#b58863' },
  { id: 'green', label: 'Vert', light: '#eeeed2', dark: '#769656' },
  { id: 'blue', label: 'Bleu', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'grey', label: 'Gris', light: '#e2e2e2', dark: '#9b9b9b' },
  { id: 'purple', label: 'Violet', light: '#e9e1f5', dark: '#9b86c4' },
  { id: 'coral', label: 'Corail', light: '#f6e2d8', dark: '#cf8a74' },
  { id: 'night', label: 'Nuit', light: '#8fa1b3', dark: '#4b5b6e' },
];

export const DEFAULT_BOARD_THEME = BOARD_THEMES[0];

const ROLES = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight', P: 'pawn' } as const;

/** CSS giving chessground's <piece> elements the images of a piece set. */
export function pieceSetCss(setId: string, baseUrl: string): string {
  const rules: string[] = [];
  for (const [color, colorName] of [
    ['w', 'white'],
    ['b', 'black'],
  ] as const) {
    for (const [letter, role] of Object.entries(ROLES)) {
      rules.push(
        `.cg-wrap piece.${role}.${colorName} { background-image: url('${baseUrl}pieces/${setId}/${color}${letter}.svg'); }`,
      );
    }
  }
  return rules.join('\n');
}

/** Applies the board colors and piece set to the page. */
export function applyAppearance(settings: { boardLight: string; boardDark: string; pieceSet: string }): void {
  const root = document.documentElement;
  root.style.setProperty('--board-light', settings.boardLight);
  root.style.setProperty('--board-dark', settings.boardDark);
  let style = document.getElementById('piece-set') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'piece-set';
    document.head.appendChild(style);
  }
  style.textContent = pieceSetCss(settings.pieceSet, import.meta.env.BASE_URL);
}
