import { describe, expect, it } from 'vitest';
import { MISTAKE_LABELS, SUMMARY_LABELS, parseSections } from '@/coach/sections';

describe('parseSections', () => {
  it('splits labelled sections and normalises keys', () => {
    const text =
      '**INDICE:** Ta dame est en prise.\nEXPLICATION: Le cavalier la prend.\nLEÇON: Vérifie.\nTHÈME: pièce non défendue';
    expect(parseSections(text, MISTAKE_LABELS)).toEqual({
      INDICE: 'Ta dame est en prise.',
      EXPLICATION: 'Le cavalier la prend.',
      LECON: 'Vérifie.',
      THEME: 'pièce non défendue',
    });
  });

  it('handles partial streamed text and multi-word labels', () => {
    expect(parseSections('BILAN: Partie longue.\nPOINTS FOR', SUMMARY_LABELS)).toEqual({
      BILAN: 'Partie longue.\nPOINTS FOR',
    });
    expect(parseSections('À TRAVAILLER: Les finales.', SUMMARY_LABELS)).toEqual({
      'A TRAVAILLER': 'Les finales.',
    });
  });
});
