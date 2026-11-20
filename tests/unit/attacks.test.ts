import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { attackTable, attackersOf, findPins, hangingPieces } from '@/chess/attacks';

const squares = (fen: string, sq: Parameters<typeof attackersOf>[1], color: 'w' | 'b') => {
  const r = attackersOf(new Chess(fen), sq, color);
  return {
    active: r.active.map((a) => (a.behind ? `${a.square}<${a.behind}` : a.square)).sort(),
    pinned: r.pinned.map((p) => p.square).sort(),
  };
};

describe('attacksOf', () => {
  it('counts the attackers and defenders of e5 (position reported by a user)', () => {
    const fen = 'r3kb1r/ppqb1ppp/2n1p1n1/3pP3/1P5P/P4N2/1BP2PP1/R2QKB1R w KQkq - 0 12';
    expect(squares(fen, 'e5', 'b').active).toEqual(['c6', 'c7', 'g6']);
    expect(squares(fen, 'e5', 'w').active).toEqual(['b2', 'f3']);
    expect(attackTable(fen)).toContain('Pion e5 (Blancs) : attaqué 3 fois');
  });

  it('includes pieces lined up in a battery', () => {
    expect(squares('4k3/3p4/8/8/8/8/3R4/3QK3 w - - 0 1', 'd7', 'w').active).toEqual(['d1<d2', 'd2']);
    expect(squares('4k3/8/8/4p3/3P4/2B5/8/4K3 w - - 0 1', 'e5', 'w').active).toEqual(['c3<d4', 'd4']);
    expect(squares('4k3/8/8/4p3/8/8/1B6/Q3K3 w - - 0 1', 'e5', 'w').active).toEqual(['a1<b2', 'b2']);
  });

  it('excludes pieces pinned to their king, and what stands behind them', () => {
    expect(squares('4k3/8/2n5/1B2P3/8/8/8/4K3 b - - 0 1', 'e5', 'b')).toEqual({ active: [], pinned: ['c6'] });
    expect(squares('1k6/8/8/4p3/r2B3K/2Q5/8/8 w - - 0 1', 'e5', 'w')).toEqual({ active: [], pinned: ['d4'] });
  });

  it('lets a pinned piece take its pinner', () => {
    expect(squares('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1', 'e8', 'w').active).toEqual(['e2']);
    expect(squares('1k6/6q1/8/8/3B4/8/8/K7 w - - 0 1', 'g7', 'w').active).toEqual(['d4']);
  });
});

describe('pins and hanging pieces', () => {
  it('finds relative pins', () => {
    const pins = findPins(new Chess('3qk3/8/8/3n4/8/8/3R4/4K3 w - - 0 1'));
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({ square: 'd5', target: 'd8', absolute: false });
  });

  it('reports an undefended attacked piece', () => {
    const chess = new Chess('4k3/8/8/8/6q1/8/8/4K1Q1 b - - 0 1');
    expect(hangingPieces(chess, 'b')).toEqual(['Dame g4 (non défendue)']);
  });

  it('names the cheaper attacker instead of calling a pawn a piece', () => {
    const chess = new Chess('4k3/8/8/3p4/2N5/1P6/8/4K3 w - - 0 1');
    expect(hangingPieces(chess, 'w')).toEqual(['Cavalier c4 (attaqué par Pion d5, de moindre valeur)']);
  });
});

describe('attack table owners', () => {
  // Black to play after 1. e4 e5 2. Qh5: the student has Black, the white queen is the engine's.
  const qh5 = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2';

  it('says which side belongs to the student and which to the engine', () => {
    const table = attackTable(qh5, 'b');
    expect(table).toContain('Pion e5 (élève, Noirs) : attaqué 1 fois par le moteur (Dame h5)');
    expect(table).toContain(
      "Pion f7 (élève, Noirs) : attaqué 1 fois par le moteur (Dame h5) ; défendu 1 fois par l'élève (Roi e8",
    );
    expect(attackTable(qh5)).toContain('Pion e5 (Noirs) : attaqué 1 fois par les Blancs (Dame h5)');
  });

  it('does not call pawns pieces when nothing is attacked', () => {
    expect(attackTable('4k3/8/8/8/8/8/8/4K3 w - - 0 1', 'w')).toContain(
      'Aucune pièce ni aucun pion attaqué.',
    );
  });
});
