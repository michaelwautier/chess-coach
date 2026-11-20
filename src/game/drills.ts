import type { Square } from 'chess.js';
import type { Color, MoveClass } from '@/chess/types';
import type { MoveVerdict } from './analysis';
import type { Issue } from './types';

/**
 * An exercise made from one of the user's mistakes: the position before the move, to be solved again later
 * with spaced repetition (Leitner boxes).
 */
export interface Drill {
  /** Position key (FEN without the move counters): one exercise per position. */
  id: string;
  fen: string;
  /** Side to move, i.e. the user's color in that game. */
  color: Color;
  /** Move the user played in the game, and the engine's best move. */
  playedUci: string;
  playedSan: string;
  bestUci: string;
  bestSan: string;
  /** Best line in French notation, shown with the solution. */
  line: string;
  cls: MoveClass;
  /** Set when the exercise is a missed chance: the engine's blunder the user did not punish. */
  opp: { san: string; from: Square; to: Square } | null;
  /** Coach's hint and lesson from the game, when there were any. */
  hint: string;
  lesson: string;
  theme: string;
  /** Date of the game it comes from. */
  source: string;
  createdAt: number;
  dueAt: number;
  /** Index in INTERVAL_DAYS of the current interval; past the end, the exercise is retired. */
  box: number;
  /** Times it was failed. */
  lapses: number;
}

export const INTERVAL_DAYS = [1, 3, 7, 14, 30];
const DAY = 24 * 60 * 60 * 1000;
/** Most exercises kept; retired ones, then the oldest, are dropped beyond that. */
export const MAX_DRILLS = 200;

/** FEN without the halfmove and fullmove counters, so the same position always gives the same key. */
export const positionKey = (fen: string): string => fen.split(' ').slice(0, 4).join(' ');

/** Exercise for an issue, if it makes a good one: mistakes, blunders and missed chances. */
export function drillFromIssue(issue: Issue, source: string, now: number): Drill | null {
  if (issue.cls === 'inaccuracy' && !issue.opp) return null;
  if (!issue.bestUci || issue.bestUci === issue.uci) return null;
  const color: Color = issue.fenBefore.split(' ')[1] === 'b' ? 'b' : 'w';
  return {
    id: positionKey(issue.fenBefore),
    fen: issue.fenBefore,
    color,
    playedUci: issue.uci,
    playedSan: issue.san,
    bestUci: issue.bestUci,
    bestSan: issue.bestSan,
    line: issue.topLines[0]?.text ?? '',
    cls: issue.opp ? issue.opp.cls : issue.cls,
    opp: issue.opp ? { san: issue.opp.san, from: issue.opp.from, to: issue.opp.to } : null,
    hint: issue.coach.sections['INDICE'] ?? '',
    // Section keys are stored without accents (see parseSections).
    lesson: issue.coach.sections['LECON'] ?? '',
    theme: issue.coach.sections['THEME'] ?? '',
    source,
    createdAt: now,
    dueAt: now + INTERVAL_DAYS[0] * DAY,
    box: 0,
    lapses: 0,
  };
}

/**
 * Adds new exercises. A position already in the list was got wrong again in a real game: its schedule
 * starts over, with the latest explanation.
 */
export function mergeDrills(existing: Drill[], added: Drill[]): Drill[] {
  const byId = new Map(existing.map((d) => [d.id, d]));
  for (const d of added) {
    const old = byId.get(d.id);
    byId.set(d.id, old ? { ...d, createdAt: old.createdAt, lapses: old.lapses + 1 } : d);
  }
  return trimDrills([...byId.values()]);
}

export const isRetired = (d: Drill): boolean => d.box >= INTERVAL_DAYS.length;

/** Keeps at most MAX_DRILLS exercises, dropping retired ones first, then the oldest. */
export function trimDrills(drills: Drill[]): Drill[] {
  if (drills.length <= MAX_DRILLS) return drills;
  const ranked = [...drills].sort(
    (a, b) => Number(isRetired(a)) - Number(isRetired(b)) || b.createdAt - a.createdAt,
  );
  const kept = new Set(ranked.slice(0, MAX_DRILLS));
  return drills.filter((d) => kept.has(d));
}

/** Exercises to do now, the most overdue first. */
export function dueDrills(drills: Drill[], now: number): Drill[] {
  return drills.filter((d) => !isRetired(d) && d.dueAt <= now).sort((a, b) => a.dueAt - b.dueAt);
}

/** Next time an exercise comes due, or null if none is waiting. */
export function nextDue(drills: Drill[]): number | null {
  const waiting = drills.filter((d) => !isRetired(d)).map((d) => d.dueAt);
  return waiting.length ? Math.min(...waiting) : null;
}

/**
 * Schedules an exercise after an answer. Right: next interval (1, 3, 7, 14, 30 days), and retired once
 * solved at 30 days. Wrong: back to 1 day.
 */
export function gradeDrill(drill: Drill, correct: boolean, now: number): Drill {
  if (!correct) return { ...drill, box: 0, dueAt: now + INTERVAL_DAYS[0] * DAY, lapses: drill.lapses + 1 };
  const box = drill.box + 1;
  const days = INTERVAL_DAYS[box];
  return { ...drill, box, dueAt: days === undefined ? Number.MAX_SAFE_INTEGER : now + days * DAY };
}

/**
 * Whether an answer solves the exercise: any move that loses less than 0.1 in winning chances compared with
 * the best one (the scale of `judgeMove`), and that does not let a short forced mate slip.
 */
export const solves = (verdict: Pick<MoveVerdict, 'loss' | 'missedMate'>): boolean =>
  verdict.loss < 0.1 && !verdict.missedMate;

// ---- validation on load ------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const STRINGS = ['fen', 'playedUci', 'playedSan', 'bestUci', 'bestSan', 'line', 'source'] as const;
const CLASSES: MoveClass[] = ['inaccuracy', 'mistake', 'blunder'];

function drill(v: unknown): Drill | null {
  if (!isObj(v) || !STRINGS.every((k) => isStr(v[k]))) return null;
  if (!CLASSES.includes(v.cls as MoveClass) || (v.color !== 'w' && v.color !== 'b')) return null;
  if (!isNum(v.createdAt) || !isNum(v.dueAt) || !isNum(v.box) || v.box < 0) return null;
  const opp =
    isObj(v.opp) && isStr(v.opp.san) && isStr(v.opp.from) && isStr(v.opp.to)
      ? { san: v.opp.san, from: v.opp.from as Square, to: v.opp.to as Square }
      : null;
  const text = (k: string) => (isStr(v[k]) ? (v[k] as string) : '');
  return {
    id: positionKey(v.fen as string),
    fen: v.fen as string,
    color: v.color,
    playedUci: v.playedUci as string,
    playedSan: v.playedSan as string,
    bestUci: v.bestUci as string,
    bestSan: v.bestSan as string,
    line: v.line as string,
    cls: v.cls as MoveClass,
    opp,
    hint: text('hint'),
    lesson: text('lesson'),
    theme: text('theme'),
    source: v.source as string,
    createdAt: v.createdAt,
    dueAt: v.dueAt,
    box: Math.floor(v.box),
    lapses: isNum(v.lapses) ? v.lapses : 0,
  };
}

/** Reads stored exercises back, dropping anything malformed and duplicate positions. */
export function sanitizeDrills(raw: unknown): Drill[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, Drill>();
  for (const d of raw.map(drill)) if (d && !byId.has(d.id)) byId.set(d.id, d);
  return [...byId.values()];
}
