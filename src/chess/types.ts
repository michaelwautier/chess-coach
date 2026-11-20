export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Engine score from a given side's point of view: centipawns or moves to mate. */
export interface Score {
  cp: number | null;
  mate: number | null;
}

export type MoveClass = 'inaccuracy' | 'mistake' | 'blunder';
