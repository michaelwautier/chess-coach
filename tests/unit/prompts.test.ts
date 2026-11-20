import { describe, expect, it } from 'vitest';
import { possessive } from '@/chess/constants';
import { pieceTypeAt } from '@/chess/notation';
import { advicePrompt } from '@/coach/prompts';

// 1. e4 e5 2. Qh5, Black to play.
const QH5 = 'rnbqkbnr/pppp1ppp/8/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2';

describe('coach wording', () => {
  it('tells the model which color is the student’s', () => {
    const prompt = advicePrompt(QH5, ['g7g6'], ['e4', 'e5', 'Qh5'], { userColor: 'b', rating: '1500' });
    expect(prompt).toContain("L'élève joue les Noirs");
    expect(prompt).toContain('Ne dis jamais « ta dame blanche »');
    expect(prompt).toContain("Pièces et pions de l'élève (Noirs) : Roi e8");
    expect(prompt).toContain('Pièces et pions du moteur (Blancs) : Roi e1');
    expect(prompt).toContain('Pion e5 (élève, Noirs) : attaqué 1 fois par le moteur (Dame h5)');
  });

  it('tells the model that a pawn is not a piece', () => {
    const prompt = advicePrompt(QH5, ['g7g6'], [], { userColor: 'w', rating: '1500' });
    expect(prompt).toContain("Un pion n'est pas une pièce");
    expect(prompt).toContain('Ne dis jamais « ta dame noire »');
  });

  it('names the piece or pawn on a square', () => {
    expect(pieceTypeAt(QH5, 'h5')).toBe('q');
    expect(pieceTypeAt(QH5, 'e5')).toBe('p');
    expect(pieceTypeAt(QH5, 'e3')).toBeNull();
    expect(possessive('p', 'ton')).toBe('ton pion');
    expect(possessive('q', 'son')).toBe('sa dame');
    expect(possessive('r', 'ton')).toBe('ta tour');
    expect(possessive('n', 'son')).toBe('son cavalier');
  });
});
