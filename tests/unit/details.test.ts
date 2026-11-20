import { describe, expect, it } from 'vitest';
import { reactive } from 'vue';
import { buildDetails, sanitizeDetails, statsFromRecord } from '@/game/details';
import { emptyAnswer, type GameRecord, type GameStats, type Issue, type OpponentError } from '@/game/types';

const stats: GameStats = {
  counts: { inaccuracy: 1, mistake: 0, blunder: 1 },
  moves: 20,
  extraErrors: 0,
  retried: 1,
  rewoundBlunders: 1,
  accuracy: 81.5,
  accuracyFinal: 88,
  oppErrors: 1,
  oppMissed: 0,
};

const opp: OpponentError = {
  ply: 4,
  san: 'Qh4',
  from: 'd8',
  to: 'h4',
  cls: 'blunder',
  before: { cp: -20, mate: null },
  after: { cp: 350, mate: null },
  missedFirst: false,
  exploited: true,
};

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: '5-1',
  ply: 5,
  moveLabel: '3. Fc4',
  san: 'Bc4',
  uci: 'f1c4',
  from: 'f1',
  to: 'c4',
  fenBefore: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 2',
  fenAfter: 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 2',
  cls: 'blunder',
  missedMate: false,
  bestScore: { cp: 40, mate: null },
  afterScore: { cp: -300, mate: null },
  wpBefore: 53.6,
  wpAfter: 22.4,
  bestUci: 'f3e5',
  bestSan: 'Nxe5',
  topLines: [{ uci: 'f3e5', text: '3. Cxe5', eval: '+0,4' }],
  refutationUci: ['d8h4'],
  refutationText: '3... Dh4',
  hanging: ['e4'],
  recent: '1. e4 e5 2. Cf3',
  opp,
  status: 'retried',
  solutionShown: true,
  coach: {
    status: 'done',
    sections: { INDICE: 'Regarde e5.', LEÇON: 'Prends ce qui est offert.' },
    raw: 'INDICE: Regarde e5.',
    error: '',
  },
  ...over,
});

const record: GameRecord = {
  date: '2026-11-20T12:00:00.000Z',
  color: 'w',
  tc: '10+0',
  level: 9,
  levelAfter: 8,
  result: 'loss',
  reason: 'abandon',
  accuracy: 81,
  accuracyFinal: 88,
  counts: { inaccuracy: 1, mistake: 0, blunder: 1 },
  retried: 1,
  hints: 2,
  oppErrors: 1,
  oppMissed: 0,
  plies: 20,
  themes: [],
  pgn: '1. e4 e5 *',
};

/** Details as they come back from storage. */
const roundTrip = (value: unknown) => sanitizeDetails(JSON.parse(JSON.stringify(value)));

describe('game details', () => {
  it('stores reactive game objects and reads them back', () => {
    const live = reactive({ issues: [issue()], summary: emptyAnswer() });
    live.summary.sections['BILAN'] = 'Bonne partie.';
    live.summary.raw = 'BILAN: Bonne partie.';
    const details = buildDetails({
      key: record.date,
      stats,
      issues: live.issues,
      engineErrors: [opp],
      summary: live.summary,
    });
    expect(roundTrip(details)).toEqual({
      version: 1,
      key: record.date,
      stats,
      issues: [issue()],
      engineErrors: [opp],
      summary: {
        status: 'done',
        sections: { BILAN: 'Bonne partie.' },
        raw: 'BILAN: Bonne partie.',
        error: '',
      },
    });
  });

  it('marks answers that were still loading or failed as finished or empty', () => {
    const streaming = issue({
      coach: { status: 'streaming', sections: { INDICE: 'Reg' }, raw: 'INDICE: Reg', error: '' },
    });
    const failed = issue({
      id: 'x',
      coach: { status: 'error', sections: {}, raw: '', error: 'Clé refusée' },
    });
    const details = roundTrip(
      buildDetails({
        key: 'k',
        stats,
        issues: [streaming, failed],
        engineErrors: [],
        summary: emptyAnswer(),
      }),
    );
    expect(details?.issues.map((i) => i.coach.status)).toEqual(['done', 'idle']);
    expect(details?.issues[1].coach.error).toBe('');
  });

  it('drops invalid entries and rejects unusable data', () => {
    expect(sanitizeDetails(null)).toBeNull();
    expect(sanitizeDetails({ version: 2, key: 'k', stats })).toBeNull();
    expect(sanitizeDetails({ version: 1, key: 'k', stats: { counts: {} } })).toBeNull();

    const details = sanitizeDetails({
      version: 1,
      key: 'k',
      stats,
      issues: [issue(), { ...issue(), cls: 'oops' }, { ...issue(), fenBefore: 3 }, 'junk'],
      engineErrors: [opp, { ...opp, cls: 'inaccuracy' }],
      summary: 'not an answer',
    });
    expect(details?.issues).toHaveLength(1);
    expect(details?.engineErrors).toEqual([opp]);
    expect(details?.summary).toEqual(emptyAnswer());
  });

  it('keeps an issue whose missed opportunity is unreadable, without it', () => {
    const details = sanitizeDetails({
      version: 1,
      key: 'k',
      stats,
      issues: [{ ...issue(), opp: { ply: 'x' } }],
    });
    expect(details?.issues[0].opp).toBeNull();
  });

  it('rebuilds statistics from a record saved without details', () => {
    expect(statsFromRecord(record)).toEqual({
      counts: { inaccuracy: 1, mistake: 0, blunder: 1 },
      moves: 0,
      extraErrors: 0,
      retried: 1,
      rewoundBlunders: 0,
      accuracy: 81,
      accuracyFinal: 88,
      oppErrors: 1,
      oppMissed: 0,
    });
  });
});
