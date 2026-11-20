import { describe, expect, it } from 'vitest';
import { continueUndoStage } from '@/game/undo';
import type { Issue } from '@/game/types';

const issue = (status: Issue['status']) => ({ ply: 4, status });

describe('continueUndoStage', () => {
  it('can undo while the engine thinks about its reply', () => {
    expect(continueUndoStage(issue('continued'), 'engine', 5)).toBe('thinking');
  });

  it('can undo after the engine replied, until the user moves again', () => {
    expect(continueUndoStage(issue('continued'), 'user', 6)).toBe('replied');
    expect(continueUndoStage(issue('continued'), 'checking', 7)).toBeNull();
    expect(continueUndoStage(issue('continued'), 'engine', 7)).toBeNull();
    expect(continueUndoStage(issue('continued'), 'user', 8)).toBeNull();
  });

  it('cannot undo during advice, after the game ended or for an issue that was not continued', () => {
    expect(continueUndoStage(issue('continued'), 'advice', 6)).toBeNull();
    expect(continueUndoStage(issue('continued'), 'over', 6)).toBeNull();
    expect(continueUndoStage(issue('open'), 'coaching', 5)).toBeNull();
    expect(continueUndoStage(issue('retried'), 'user', 4)).toBeNull();
    expect(continueUndoStage(issue('silent'), 'engine', 5)).toBeNull();
    expect(continueUndoStage(null, 'engine', 5)).toBeNull();
  });
});
