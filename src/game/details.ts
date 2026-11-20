import type { MoveClass, Score } from '@/chess/types';
import {
  emptyAnswer,
  type CoachAnswer,
  type GameRecord,
  type GameStats,
  type Issue,
  type OpponentError,
  type TopLine,
} from './types';

/**
 * What is kept of a finished game to replay it: the judgements, the coach's answers and the end-of-game
 * summary. Stored apart from the GameRecord (keyed by its date) so it can be dropped when space runs out
 * while the record (PGN and statistics) stays.
 */
export interface GameDetails {
  version: 1;
  /** `date` of the matching GameRecord. */
  key: string;
  stats: GameStats;
  issues: Issue[];
  engineErrors: OpponentError[];
  summary: CoachAnswer;
}

export interface DetailsSource {
  key: string;
  stats: GameStats;
  issues: Issue[];
  engineErrors: OpponentError[];
  summary: CoachAnswer;
}

/** Plain copy of the live (reactive) game objects, ready to be stored. */
export function buildDetails(source: DetailsSource): GameDetails {
  const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    version: 1,
    key: source.key,
    stats: plain(source.stats),
    issues: plain(source.issues),
    engineErrors: plain(source.engineErrors),
    summary: plain(source.summary),
  };
}

/** Statistics of a game saved without details: what its GameRecord keeps. */
export function statsFromRecord(record: GameRecord): GameStats {
  return {
    counts: { ...record.counts },
    moves: 0,
    extraErrors: 0,
    retried: record.retried,
    rewoundBlunders: 0,
    accuracy: record.accuracy,
    accuracyFinal: record.accuracyFinal,
    oppErrors: record.oppErrors,
    oppMissed: record.oppMissed,
  };
}

// ---- validation on load ------------------------------------------------------
// Stored data can be old, truncated or edited by hand: anything that does not have the expected shape is
// dropped instead of breaking the review.

type Obj = Record<string, unknown>;
const CLASSES: MoveClass[] = ['inaccuracy', 'mistake', 'blunder'];
const STATUSES: Issue['status'][] = ['open', 'retried', 'continued', 'silent'];

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isClass = (v: unknown): v is MoveClass => CLASSES.includes(v as MoveClass);
const allStr = (o: Obj, keys: string[]) => keys.every((k) => isStr(o[k]));

function score(v: unknown): Score | null {
  return isObj(v) && isNumOrNull(v.cp) && isNumOrNull(v.mate) ? { cp: v.cp, mate: v.mate } : null;
}

function answer(v: unknown): CoachAnswer {
  if (!isObj(v)) return emptyAnswer();
  const sections: Record<string, string> = {};
  if (isObj(v.sections)) for (const [k, s] of Object.entries(v.sections)) if (isStr(s)) sections[k] = s;
  const raw = isStr(v.raw) ? v.raw : '';
  // An answer cut off by the end of the session is shown as it was; nothing is loading any more.
  return { status: raw ? 'done' : 'idle', sections, raw, error: '' };
}

function opponentError(v: unknown): OpponentError | null {
  if (!isObj(v) || !isNum(v.ply) || !allStr(v, ['san', 'from', 'to'])) return null;
  if (v.cls !== 'mistake' && v.cls !== 'blunder') return null;
  const before = score(v.before);
  const after = score(v.after);
  if (!before || !after) return null;
  return {
    ply: v.ply,
    san: v.san as string,
    from: v.from as OpponentError['from'],
    to: v.to as OpponentError['to'],
    cls: v.cls,
    before,
    after,
    missedFirst: v.missedFirst === true,
    exploited: v.exploited === true,
  };
}

function topLine(v: unknown): TopLine | null {
  return isObj(v) && allStr(v, ['uci', 'text', 'eval'])
    ? { uci: v.uci as string, text: v.text as string, eval: v.eval as string }
    : null;
}

const ISSUE_STRINGS = [
  'id',
  'moveLabel',
  'san',
  'uci',
  'from',
  'to',
  'fenBefore',
  'fenAfter',
  'bestUci',
  'bestSan',
  'refutationText',
  'recent',
];

function issue(v: unknown): Issue | null {
  if (!isObj(v) || !isNum(v.ply) || !allStr(v, ISSUE_STRINGS) || !isClass(v.cls)) return null;
  const bestScore = score(v.bestScore);
  const afterScore = score(v.afterScore);
  if (!bestScore || !afterScore || !isNum(v.wpBefore) || !isNum(v.wpAfter)) return null;
  const topLines = Array.isArray(v.topLines) ? v.topLines.map(topLine) : [];
  if (topLines.some((l) => !l)) return null;
  return {
    id: v.id as string,
    ply: v.ply,
    moveLabel: v.moveLabel as string,
    san: v.san as string,
    uci: v.uci as string,
    from: v.from as Issue['from'],
    to: v.to as Issue['to'],
    fenBefore: v.fenBefore as string,
    fenAfter: v.fenAfter as string,
    cls: v.cls,
    missedMate: v.missedMate === true,
    bestScore,
    afterScore,
    wpBefore: v.wpBefore,
    wpAfter: v.wpAfter,
    bestUci: v.bestUci as string,
    bestSan: v.bestSan as string,
    topLines: topLines as TopLine[],
    refutationUci: isStrArray(v.refutationUci) ? v.refutationUci : [],
    refutationText: v.refutationText as string,
    hanging: isStrArray(v.hanging) ? v.hanging : [],
    recent: v.recent as string,
    opp: v.opp ? opponentError(v.opp) : null,
    status: STATUSES.includes(v.status as Issue['status']) ? (v.status as Issue['status']) : 'continued',
    solutionShown: v.solutionShown === true,
    coach: answer(v.coach),
  };
}

function stats(v: unknown): GameStats | null {
  if (!isObj(v) || !isObj(v.counts)) return null;
  const counts = v.counts;
  if (!CLASSES.every((c) => isNum(counts[c]))) return null;
  const nums = ['moves', 'extraErrors', 'retried', 'rewoundBlunders', 'oppErrors', 'oppMissed'];
  if (!nums.every((k) => isNum(v[k])) || !isNumOrNull(v.accuracy) || !isNumOrNull(v.accuracyFinal)) {
    return null;
  }
  return {
    counts: {
      inaccuracy: counts.inaccuracy as number,
      mistake: counts.mistake as number,
      blunder: counts.blunder as number,
    },
    moves: v.moves as number,
    extraErrors: v.extraErrors as number,
    retried: v.retried as number,
    rewoundBlunders: v.rewoundBlunders as number,
    accuracy: v.accuracy,
    accuracyFinal: v.accuracyFinal,
    oppErrors: v.oppErrors as number,
    oppMissed: v.oppMissed as number,
  };
}

/** Reads stored details back; null when they are missing or unusable. Invalid entries are dropped. */
export function sanitizeDetails(raw: unknown): GameDetails | null {
  if (!isObj(raw) || raw.version !== 1 || !isStr(raw.key)) return null;
  const s = stats(raw.stats);
  if (!s) return null;
  const issues = Array.isArray(raw.issues) ? raw.issues.map(issue).filter((i): i is Issue => !!i) : [];
  const engineErrors = Array.isArray(raw.engineErrors)
    ? raw.engineErrors.map(opponentError).filter((e): e is OpponentError => !!e)
    : [];
  return { version: 1, key: raw.key, stats: s, issues, engineErrors, summary: answer(raw.summary) };
}
