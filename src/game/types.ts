import type { Square } from 'chess.js';
import type { Color, MoveClass, Score } from '@/chess/types';
import type { ModelTier, ProviderId } from '@/coach/providers/types';

export type Phase = 'setup' | 'user' | 'checking' | 'coaching' | 'engine' | 'advice' | 'over';
export type CoachThreshold = MoveClass | 'off';
export type Outcome = 'win' | 'loss' | 'draw';
export type ProviderChoice = 'auto' | ProviderId | 'none';

export const TIME_CONTROLS = {
  '5+3': { minutes: 5, increment: 3 },
  '10+0': { minutes: 10, increment: 0 },
  '10+5': { minutes: 10, increment: 5 },
  '15+10': { minutes: 15, increment: 10 },
} as const;
export type TimeControl = keyof typeof TIME_CONTROLS;

export interface Settings {
  color: Color | 'random';
  tc: TimeControl;
  level: number;
  adaptive: boolean;
  coachOn: CoachThreshold;
  coachTier: ModelTier;
  ratingChesscom: number | null;
  ratingLichess: number | null;
  provider: ProviderChoice;
  /** Preset id from BOARD_THEMES, or 'custom' when the colors were picked by hand. */
  boardTheme: string;
  boardLight: string;
  boardDark: string;
  pieceSet: string;
}

export type CoachStatus = 'idle' | 'loading' | 'streaming' | 'done' | 'error' | 'unavailable';

/** A coach answer being written, split into labelled sections. */
export interface CoachAnswer {
  status: CoachStatus;
  sections: Record<string, string>;
  /** Whole answer text, shown as-is if the model ignored the expected format. */
  raw: string;
  error: string;
}

/** An error by the engine that the user could exploit on the next move. */
export interface OpponentError {
  ply: number;
  san: string;
  from: Square;
  to: Square;
  cls: Exclude<MoveClass, 'inaccuracy'>;
  /** User's evaluation before and after the engine's move. */
  before: Score;
  after: Score;
  missedFirst: boolean;
  exploited: boolean;
}

export interface TopLine {
  uci: string;
  text: string;
  eval: string;
}

/** A user move flagged by the analysis. */
export interface Issue {
  id: string;
  ply: number;
  moveLabel: string;
  san: string;
  uci: string;
  from: Square;
  to: Square;
  fenBefore: string;
  fenAfter: string;
  cls: MoveClass;
  missedMate: boolean;
  bestScore: Score;
  afterScore: Score;
  wpBefore: number;
  wpAfter: number;
  bestUci: string;
  bestSan: string;
  topLines: TopLine[];
  refutationUci: string[];
  refutationText: string;
  hanging: string[];
  recent: string;
  opp: OpponentError | null;
  status: 'open' | 'retried' | 'continued' | 'silent';
  solutionShown: boolean;
  coach: CoachAnswer;
}

/** Evaluation of one attempt at a user move (retried attempts are kept). */
export interface MoveEval {
  ply: number;
  acc: number;
  wpBefore: number;
  wpAfter: number;
  cls: MoveClass | null;
}

export interface GameStats {
  counts: Record<MoveClass, number>;
  moves: number;
  extraErrors: number;
  retried: number;
  rewoundBlunders: number;
  accuracy: number | null;
  accuracyFinal: number | null;
  oppErrors: number;
  oppMissed: number;
}

export interface GameResult {
  outcome: Outcome;
  reason: string;
  stats: GameStats;
  levelBefore: number;
  levelAfter: number;
  levelNote: string;
  summary: CoachAnswer;
}

/** What is stored about a finished game. */
export interface GameRecord {
  date: string;
  color: Color;
  tc: TimeControl;
  level: number;
  levelAfter: number;
  result: Outcome;
  reason: string;
  accuracy: number | null;
  accuracyFinal: number | null;
  counts: Record<MoveClass, number>;
  retried: number;
  hints: number;
  oppErrors: number;
  oppMissed: number;
  plies: number;
  themes: string[];
  pgn: string;
}

export const emptyAnswer = (): CoachAnswer => ({ status: 'idle', sections: {}, raw: '', error: '' });
