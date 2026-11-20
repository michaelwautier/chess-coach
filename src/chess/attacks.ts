import { Chess, type Square } from 'chess.js';
import { FILES, PIECE_NAME, PIECE_VALUE, colorName, isFeminine, other } from './constants';
import type { Color, PieceType } from './types';

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const PIN_VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export interface Pin {
  /** Pinned piece. */
  square: Square;
  type: PieceType;
  color: Color;
  pinner: Square;
  pinnerType: PieceType;
  /** The more valuable piece behind the pinned one. */
  target: Square;
  targetType: PieceType;
  /** Pinned to the king: the piece may only move along `line`. */
  absolute: boolean;
  /** Squares the pinned piece may move to without breaking the pin (pinner included). */
  line: Square[];
}

export interface Attacker {
  square: Square;
  /** Set when the piece attacks through a battery, standing behind this square. */
  behind: Square | null;
}

export interface AttackersResult {
  active: Attacker[];
  /** Attackers pinned to their own king that cannot legally reach the square. */
  pinned: { square: Square; pin: Pin }[];
}

function step(square: string, df: number, dr: number, k: number): Square | null {
  const f = FILES.indexOf(square[0]) + df * k;
  const r = Number(square[1]) + dr * k;
  if (f < 0 || f > 7 || r < 1 || r > 8) return null;
  return `${FILES[f]}${r}` as Square;
}

const isSliderFor = (type: PieceType, diagonal: boolean): boolean =>
  type === 'q' || (diagonal ? type === 'b' : type === 'r');

/**
 * All pins on the board: an enemy rook, bishop or queen would hit a more valuable piece standing
 * behind the pinned one. Absolute pins (to the king) restrict legal moves to `line`.
 */
export function findPins(chess: Chess): Pin[] {
  const pins: Pin[] = [];
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || !['b', 'r', 'q'].includes(p.type)) continue;
      const color = other(p.color);
      for (const [df, dr] of DIRECTIONS) {
        const diagonal = df !== 0 && dr !== 0;
        if (!isSliderFor(p.type, diagonal)) continue;
        let first: { square: Square; type: PieceType } | null = null;
        const line: Square[] = [p.square];
        for (let k = 1; k < 8; k++) {
          const sq = step(p.square, df, dr, k);
          if (!sq) break;
          const q = chess.get(sq);
          if (!q) {
            line.push(sq);
            continue;
          }
          if (!first) {
            if (q.color !== color || q.type === 'k') break;
            first = { square: sq, type: q.type };
            continue;
          }
          if (q.color === color && PIN_VALUE[q.type] > PIN_VALUE[first.type]) {
            pins.push({
              square: first.square,
              type: first.type,
              color,
              pinner: p.square,
              pinnerType: p.type,
              target: sq,
              targetType: q.type,
              absolute: q.type === 'k',
              line,
            });
          }
          break;
        }
      }
    }
  }
  return pins;
}

const absolutePinOf = (pins: Pin[], sq: Square): Pin | undefined =>
  pins.find((pin) => pin.absolute && pin.square === sq);

const canReach = (pins: Pin[], from: Square, to: Square): boolean => {
  const pin = absolutePinOf(pins, from);
  return !pin || pin.line.includes(to);
};

/**
 * Pieces of `color` able to take on `square`, including batteries: a slider standing behind another
 * attacker of the same color on the same line (queen behind a bishop or rook, bishop behind a pawn…).
 * Pieces pinned to their king that could not legally take there are returned in `pinned`; they also
 * block whatever stands behind them.
 */
export function attackersOf(
  chess: Chess,
  square: Square,
  color: Color,
  pins = findPins(chess),
): AttackersResult {
  const active: Attacker[] = [];
  const pinned: AttackersResult['pinned'] = [];
  for (const sq of chess.attackers(square, color)) {
    const pin = absolutePinOf(pins, sq);
    if (!pin || pin.line.includes(square)) active.push({ square: sq, behind: null });
    else pinned.push({ square: sq, pin });
  }
  for (const [df, dr] of DIRECTIONS) {
    const diagonal = df !== 0 && dr !== 0;
    let front: Square | null = null;
    for (let k = 1; k < 8; k++) {
      const sq = step(square, df, dr, k);
      if (!sq) break;
      const p = chess.get(sq);
      if (!p) continue;
      if (p.color !== color) break;
      const slider = isSliderFor(p.type, diagonal);
      // A pawn attacks one step diagonally, towards the enemy side.
      const pawnFront = p.type === 'p' && k === 1 && diagonal && dr === (color === 'w' ? -1 : 1);
      if (!front) {
        if ((!slider && !pawnFront) || !canReach(pins, sq, square)) break;
        front = sq;
        continue;
      }
      if (!slider) break;
      const pin = absolutePinOf(pins, sq);
      if (pin && !pin.line.includes(square)) {
        pinned.push({ square: sq, pin });
        break;
      }
      active.push({ square: sq, behind: front });
      front = sq;
    }
  }
  return { active, pinned };
}

/**
 * Attack/defence table computed by code, so the coach never has to count on the board. With
 * `userColor`, every line says which side belongs to the student and which to the engine.
 */
export function attackTable(fen: string, userColor?: Color): string {
  const chess = new Chess(fen);
  const pins = findPins(chess);
  const name = (sq: Square): string => `${PIECE_NAME[chess.get(sq)!.type]} ${sq}`;
  /** "(Noirs)", or "(élève, Noirs)" / "(moteur, Blancs)". */
  const tag = (c: Color): string =>
    userColor ? `${c === userColor ? 'élève' : 'moteur'}, ${colorName(c)}` : colorName(c);
  /** "les Noirs", or "l'élève" / "le moteur". */
  const by = (c: Color): string =>
    userColor ? (c === userColor ? "l'élève" : 'le moteur') : `les ${colorName(c)}`;
  const label = (a: Attacker): { text: string; order: number } => {
    const p = chess.get(a.square)!;
    let extra = a.behind ? ` en batterie derrière ${name(a.behind)}` : '';
    const relative = pins.find((pin) => !pin.absolute && pin.square === a.square);
    if (relative)
      extra += ` (cloué sur ${name(relative.target)} par ${name(relative.pinner)} : prendre la découvrirait)`;
    if (p.type === 'k') extra += " (seulement si la case n'est plus défendue)";
    return {
      text: `${PIECE_NAME[p.type]} ${a.square}${extra}`,
      order: (PIECE_VALUE[p.type] || 100) + (a.behind ? 1000 : 0),
    };
  };
  const list = (arr: Attacker[]): string =>
    arr
      .map(label)
      .sort((a, b) => a.order - b.order)
      .map((x) => x.text)
      .join(', ');
  const pinnedNote = (arr: AttackersResult['pinned']): string =>
    arr.length
      ? ` ; ne comptent pas car cloués sur leur roi : ${arr.map((x) => `${name(x.square)} (par ${name(x.pin.pinner)})`).join(', ')}`
      : '';

  const lines: string[] = [];
  for (const color of ['w', 'b'] as const) {
    for (const row of chess.board()) {
      for (const p of row) {
        if (!p || p.color !== color) continue;
        const att = attackersOf(chess, p.square, other(color), pins);
        if (!att.active.length && !att.pinned.length) continue;
        if (p.type === 'k') {
          const checking = chess.attackers(p.square, other(color));
          if (checking.length)
            lines.push(
              `Roi ${p.square} (${tag(color)}) : en échec par ${by(other(color))} (${checking.map(name).join(', ')}).`,
            );
          continue;
        }
        const def = attackersOf(chess, p.square, color, pins);
        const e = isFeminine(p.type) ? 'e' : '';
        lines.push(
          `${PIECE_NAME[p.type]} ${p.square} (${tag(color)}) : attaqué${e} ${att.active.length} fois` +
            `${att.active.length ? ` par ${by(other(color))} (${list(att.active)})` : ''}${pinnedNote(att.pinned)}` +
            ` ; défendu${e} ${def.active.length} fois${def.active.length ? ` par ${by(color)} (${list(def.active)})` : ''}${pinnedNote(def.pinned)}.`,
        );
      }
    }
  }
  const pinLines = pins.map(
    (pin) =>
      `${PIECE_NAME[pin.type]} ${pin.square} (${tag(pin.color)}) cloué${isFeminine(pin.type) ? 'e' : ''} sur ${PIECE_NAME[pin.targetType]} ${pin.target}` +
      ` par ${PIECE_NAME[pin.pinnerType]} ${pin.pinner} (${pin.absolute ? 'clouage absolu : impossible de quitter la ligne' : 'clouage relatif'}).`,
  );
  return [
    lines.length ? lines.join('\n') : 'Aucune pièce ni aucun pion attaqué.',
    pinLines.length ? `Clouages :\n${pinLines.join('\n')}` : 'Aucun clouage.',
  ].join('\n');
}

/** Pieces and pawns of `color` that are attacked and either undefended or attacked by something cheaper. */
export function hangingPieces(chess: Chess, color: Color): string[] {
  const pins = findPins(chess);
  const out: string[] = [];
  const value = (sq: Square): number => PIECE_VALUE[chess.get(sq)!.type] || 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      const attackers = attackersOf(chess, p.square, other(color), pins).active.filter((a) => !a.behind);
      if (!attackers.length) continue;
      const defenders = attackersOf(chess, p.square, color, pins).active;
      const cheapest = attackers.reduce((a, b) => (value(b.square) < value(a.square) ? b : a)).square;
      if (!defenders.length || value(cheapest) < PIECE_VALUE[p.type]) {
        const e = isFeminine(p.type) ? 'e' : '';
        const cheaper = `${PIECE_NAME[chess.get(cheapest)!.type]} ${cheapest}`;
        out.push(
          `${PIECE_NAME[p.type]} ${p.square}${defenders.length ? ` (attaqué${e} par ${cheaper}, de moindre valeur)` : ` (non défendu${e})`}`,
        );
      }
    }
  }
  return out;
}
