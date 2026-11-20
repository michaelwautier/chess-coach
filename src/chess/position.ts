import { Chess, type Square } from 'chess.js';
import { attackTable } from './attacks';
import {
  FILES,
  PIECE_NAME,
  PIECE_NAME_PLURAL,
  PIECE_VALUE,
  colorName,
  other,
  squareShade,
} from './constants';
import type { Color, PieceType } from './types';

interface BoardPiece {
  square: Square;
  type: PieceType;
  color: Color;
}

function collect(chess: Chess): Record<Color, BoardPiece[]> {
  const pieces: Record<Color, BoardPiece[]> = { w: [], b: [] };
  for (const row of chess.board()) for (const p of row) if (p) pieces[p.color].push(p);
  return pieces;
}

const fileIndex = (sq: string): number => FILES.indexOf(sq[0]);
const rankOf = (sq: string): number => Number(sq[1]);
const material = (pieces: BoardPiece[]): number => pieces.reduce((s, p) => s + PIECE_VALUE[p.type], 0);

function pawnStructure(pieces: Record<Color, BoardPiece[]>, color: Color) {
  const own = pieces[color].filter((p) => p.type === 'p');
  const opp = pieces[other(color)].filter((p) => p.type === 'p');
  const files = new Map<number, number>();
  for (const p of own) files.set(fileIndex(p.square), (files.get(fileIndex(p.square)) ?? 0) + 1);
  const doubled = [...files.entries()].filter(([, n]) => n > 1).map(([f]) => FILES[f]);
  const isolated = own
    .filter((p) => !files.has(fileIndex(p.square) - 1) && !files.has(fileIndex(p.square) + 1))
    .map((p) => p.square);
  const passed = own
    .filter((p) => {
      const f = fileIndex(p.square);
      const r = rankOf(p.square);
      return !opp.some(
        (q) =>
          Math.abs(fileIndex(q.square) - f) <= 1 &&
          (color === 'w' ? rankOf(q.square) > r : rankOf(q.square) < r),
      );
    })
    .map((p) => p.square);
  let islands = 0;
  for (let f = 0; f < 8; f++) if (files.has(f) && !files.has(f - 1)) islands++;
  const light = own.filter((p) => squareShade(p.square) === 'claire').length;
  // Holes: 3rd/4th-rank squares (relative) that own pawns can never attack again.
  const holes: string[] = [];
  for (const R of color === 'w' ? [3, 4] : [6, 5]) {
    for (let f = 1; f <= 6; f++) {
      const coverable = own.some((q) => {
        if (Math.abs(fileIndex(q.square) - f) !== 1) return false;
        return color === 'w' ? rankOf(q.square) <= R - 1 : rankOf(q.square) >= R + 1;
      });
      if (!coverable) holes.push(`${FILES[f]}${R}`);
    }
  }
  return { count: own.length, doubled, isolated, passed, islands, light, dark: own.length - light, holes };
}

function kingSafety(chess: Chess, pieces: Record<Color, BoardPiece[]>, color: Color) {
  const king = pieces[color].find((p) => p.type === 'k');
  if (!king) return null;
  const f = fileIndex(king.square);
  const r = rankOf(king.square);
  const back = color === 'w' ? 1 : 8;
  const castledSide = r === back && f >= 6 ? 'petit roque' : r === back && f <= 2 ? 'grand roque' : null;
  const dir = color === 'w' ? 1 : -1;
  const shield = pieces[color].filter((p) => {
    if (p.type !== 'p') return false;
    const d = (rankOf(p.square) - r) * dir;
    return Math.abs(fileIndex(p.square) - f) <= 1 && d >= 1 && d <= 2;
  }).length;
  const castling = chess.fen().split(' ')[2];
  const rights =
    (color === 'w' ? castling.replace(/[a-z-]/g, '') : castling.replace(/[A-Z-]/g, '')) || 'aucun';
  return { square: king.square, castledSide, shield, rights };
}

function describePieces(pieces: BoardPiece[]): string {
  const groups = new Map<PieceType, string[]>();
  for (const p of pieces) groups.set(p.type, [...(groups.get(p.type) ?? []), p.square]);
  return (['k', 'q', 'r', 'b', 'n', 'p'] as const)
    .filter((t) => groups.has(t))
    .map((t) => {
      const squares = groups.get(t)!;
      const label = squares.length > 1 ? PIECE_NAME_PLURAL[t] : PIECE_NAME[t];
      const list = squares.map((s) => (t === 'b' ? `${s} (cases ${squareShade(s)}s)` : s)).join(', ');
      return `${label} ${list}`;
    })
    .join(' ; ');
}

function sideSummary(chess: Chess, pieces: Record<Color, BoardPiece[]>, color: Color, label: string): string {
  const ps = pawnStructure(pieces, color);
  const ks = kingSafety(chess, pieces, color);
  const bishops = pieces[color].filter((p) => p.type === 'b').map((p) => squareShade(p.square));
  const bishopText =
    bishops.length === 0
      ? 'aucun fou'
      : bishops.length === 2 && bishops[0] !== bishops[1]
        ? 'paire de fous'
        : `seulement le fou de cases ${bishops.join(' et ')}s`;
  const lines = [`${label} — matériel ${material(pieces[color])} pts ; ${bishopText}.`];
  lines.push(
    `  Pions (${ps.count}) : ${ps.light} sur cases claires, ${ps.dark} sur cases sombres ; îlots : ${ps.islands}` +
      (ps.doubled.length ? ` ; doublés colonne(s) ${ps.doubled.join(', ')}` : '') +
      (ps.isolated.length ? ` ; isolé(s) ${ps.isolated.join(', ')}` : '') +
      (ps.passed.length ? ` ; passé(s) ${ps.passed.join(', ')}` : '') +
      '.',
  );
  if (ps.holes.length && ps.holes.length <= 8) {
    lines.push(
      `  Cases faibles dans son camp (plus contrôlables par ses pions) : ${ps.holes.map((h) => `${h} (${squareShade(h)})`).join(', ')}.`,
    );
  }
  if (ks) {
    lines.push(
      `  Roi en ${ks.square}${ks.castledSide ? ` (${ks.castledSide})` : ''}, ${ks.shield} pion(s) devant lui ; droits de roque : ${ks.rights}.`,
    );
  }
  return lines.join('\n');
}

/** Structured, French description of a position for the coach prompt. */
export function positionReport(fen: string, userColor: Color): string {
  const chess = new Chess(fen);
  const pieces = collect(chess);
  const has: Record<Color, Set<string>> = { w: new Set(), b: new Set() };
  for (const c of ['w', 'b'] as const) for (const p of pieces[c]) if (p.type === 'p') has[c].add(p.square[0]);
  const open = [...FILES].filter((f) => !has.w.has(f) && !has.b.has(f));
  const halfOpenW = [...FILES].filter((f) => !has.w.has(f) && has.b.has(f));
  const halfOpenB = [...FILES].filter((f) => has.w.has(f) && !has.b.has(f));
  const moveNo = Number(fen.split(' ')[5]);

  const out = [
    `Pièces des Blancs : ${describePieces(pieces.w)}`,
    `Pièces des Noirs : ${describePieces(pieces.b)}`,
    sideSummary(chess, pieces, userColor, `Élève (${colorName(userColor)})`),
    sideSummary(chess, pieces, other(userColor), `Moteur (${colorName(other(userColor))})`),
    `Colonnes ouvertes : ${open.join(', ') || 'aucune'} ; semi-ouvertes pour les Blancs : ${halfOpenW.join(', ') || 'aucune'} ; pour les Noirs : ${halfOpenB.join(', ') || 'aucune'}.`,
  ];
  if (moveNo <= 15) {
    const start: Record<Color, string[]> = { w: ['b1', 'g1', 'c1', 'f1'], b: ['b8', 'g8', 'c8', 'f8'] };
    const undeveloped = pieces[userColor]
      .filter((p) => (p.type === 'n' || p.type === 'b') && start[userColor].includes(p.square))
      .map((p) => `${PIECE_NAME[p.type]} ${p.square}`);
    if (undeveloped.length)
      out.push(`Pièces mineures de l'élève pas encore développées : ${undeveloped.join(', ')}.`);
  }
  out.push(
    'Tableau des attaques (calculé par programme : batteries comprises, pièces clouées sur leur roi exclues) :',
  );
  out.push(attackTable(fen));
  const officers = [...pieces.w, ...pieces.b].filter((p) => p.type !== 'p' && p.type !== 'k').length;
  out.push(
    `Phase : ${moveNo <= 10 ? 'ouverture' : officers <= 6 ? 'finale' : 'milieu de partie'} (coup ${moveNo}).`,
  );
  return out.join('\n');
}

export interface MaterialBalance {
  /** Pieces captured by each color. */
  captured: Record<Color, PieceType[]>;
  /** White material minus Black material, in pawns. */
  diff: number;
}

export function materialBalance(fen: string): MaterialBalance {
  const pieces = collect(new Chess(fen));
  const start: Partial<Record<PieceType, number>> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const count: Record<Color, Partial<Record<PieceType, number>>> = { w: {}, b: {} };
  for (const c of ['w', 'b'] as const)
    for (const p of pieces[c]) count[c][p.type] = (count[c][p.type] ?? 0) + 1;
  const captured: Record<Color, PieceType[]> = { w: [], b: [] };
  for (const c of ['w', 'b'] as const) {
    for (const t of ['q', 'r', 'b', 'n', 'p'] as const) {
      const missing = Math.max(0, (start[t] ?? 0) - (count[other(c)][t] ?? 0));
      for (let i = 0; i < missing; i++) captured[c].push(t);
    }
  }
  return { captured, diff: material(pieces.w) - material(pieces.b) };
}
