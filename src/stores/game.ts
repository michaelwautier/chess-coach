import { defineStore } from 'pinia';
import { Chess, type Move, type Square } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import { computed, reactive, ref, shallowRef, triggerRef } from 'vue';
import { hangingPieces } from '@/chess/attacks';
import { CLASS_INFO, other } from '@/chess/constants';
import { formatScore, negate, scoreCp } from '@/chess/evaluation';
import { formatLine, frSan, moveNumberLabel, movesText, uciLineToSan, uciOf } from '@/chess/notation';
import type { Color, PieceType } from '@/chess/types';
import { advicePrompt, mistakePrompt, summaryPrompt, type PromptContext } from '@/coach/prompts';
import { runCoach } from '@/coach/runCoach';
import { ADVICE_LABELS, MISTAKE_LABELS, SUMMARY_LABELS } from '@/coach/sections';
import { Engine, engineBuilds } from '@/engine/engine';
import { levelConfig, pickEngineMove } from '@/engine/levels';
import { lineScore, type InfoLine } from '@/engine/uci';
import { adaptLevel, computeStats, judgeMove, opponentErrorClass } from '@/game/analysis';
import { Analyst } from '@/game/analyst';
import { ChessClock } from '@/game/clock';
import {
  TIME_CONTROLS,
  emptyAnswer,
  type CoachAnswer,
  type GameResult,
  type Issue,
  type MoveEval,
  type OpponentError,
  type Outcome,
  type Phase,
} from '@/game/types';
import type { Score } from '@/chess/types';
import { useDialogStore } from './dialog';
import { useSettingsStore } from './settings';

export interface BoardView {
  fen: string;
  orientation: 'white' | 'black';
  turnColor: 'white' | 'black';
  lastMove: [Square, Square] | undefined;
  check: boolean;
  /** Legal moves for the user, empty when the board must not be movable. */
  dests: Map<Square, Square[]>;
}

export interface AdviceState {
  fen: string;
  prompt: string;
  lines: InfoLine[] | null;
  answer: CoachAnswer;
  engineHintShown: boolean;
  bestShown: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const cg = (c: Color): 'white' | 'black' => (c === 'w' ? 'white' : 'black');
const ACTIVE_PHASES: Phase[] = ['user', 'engine', 'advice', 'coaching', 'checking'];
const THRESHOLD = { inaccuracy: 1, mistake: 2, blunder: 3, off: 99 } as const;

function destsOf(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  return dests;
}

export const useGameStore = defineStore('game', () => {
  const settingsStore = useSettingsStore();
  const dialog = useDialogStore();

  // ---- state -------------------------------------------------------------
  const phase = ref<Phase>('setup');
  const chess = shallowRef(new Chess());
  const userColor = ref<Color>('w');
  const levelPlayed = ref(9);
  const clock = shallowRef(new ChessClock(600000, 0));
  const tick = ref(0);
  const issues = reactive<Issue[]>([]);
  const engineErrors = reactive(new Map<number, OpponentError>());
  const moveEvals: MoveEval[] = [];
  const afterByPly = new Map<number, Score>();
  const hints = ref(0);
  const currentIssue = ref<Issue | null>(null);
  const reviewIssue = ref<Issue | null>(null);
  const advice = ref<AdviceState | null>(null);
  const result = ref<GameResult | null>(null);
  const viewPly = ref<number | null>(null);
  /** Position shown instead of the live one (coaching hint, solution, review). */
  const override = ref<{ fen: string; lastMove?: [Square, Square] } | null>(null);
  const liveShapes = ref<DrawShape[]>([]);
  const promotionColor = ref<Color | null>(null);
  let resolvePromotion: ((p: PieceType) => void) | null = null;

  const engineStatus = ref('Chargement du moteur…');
  const enginesReady = ref(false);
  let player: Engine | null = null;
  let analyst: Analyst | null = null;
  let token = 0;
  let summaryRequest = '';

  const engineColor = computed(() => other(userColor.value));
  const history = computed(() => {
    void chess.value;
    return chess.value.history({ verbose: true }) as Move[];
  });

  // ---- engines -----------------------------------------------------------
  async function initEngines(): Promise<void> {
    try {
      const p = new Engine('player');
      const build = await p.init(engineBuilds(), (t) => (engineStatus.value = t));
      let a: Engine = p;
      try {
        const e = new Engine('analyst');
        await e.init([build]);
        a = e;
      } catch (e) {
        console.warn('analyst engine failed, sharing one engine', e);
      }
      player = p;
      analyst = new Analyst(a);
      enginesReady.value = true;
      engineStatus.value = `Moteur prêt (${build.name})`;
    } catch (e) {
      console.error(e);
      engineStatus.value = 'Le moteur n’a pas pu démarrer sur cet appareil.';
    }
  }

  // ---- clock -------------------------------------------------------------
  let ticker: ReturnType<typeof setInterval> | null = null;
  function startTicker(): void {
    ticker ??= setInterval(() => {
      tick.value++;
      const flagged = clock.value.flagged();
      if (flagged) onFlag(flagged);
    }, 100);
  }

  function clockMs(color: Color): number {
    void tick.value;
    return clock.value.remaining(color);
  }

  function hasMatingMaterial(color: Color): boolean {
    const pieces = chess.value
      .board()
      .flat()
      .filter((p) => p && p.color === color && p.type !== 'k')
      .map((p) => p!.type);
    return !(pieces.length === 0 || (pieces.length === 1 && (pieces[0] === 'n' || pieces[0] === 'b')));
  }

  function onFlag(color: Color): void {
    clock.value.remainingMs[color] = 0;
    clock.value.running = null;
    const winner = other(color);
    if (!hasMatingMaterial(winner)) void endGame('draw', 'temps écoulé, matériel insuffisant pour mater');
    else void endGame(winner === userColor.value ? 'win' : 'loss', 'temps écoulé');
  }

  // ---- board view --------------------------------------------------------
  const canBrowse = computed(() => ['user', 'engine', 'checking', 'over'].includes(phase.value));

  const board = computed<BoardView>(() => {
    const live = chess.value;
    void history.value;
    const orientation = cg(userColor.value);
    if (override.value) {
      const c = new Chess(override.value.fen);
      return {
        fen: override.value.fen,
        orientation,
        turnColor: cg(c.turn()),
        lastMove: override.value.lastMove,
        check: c.inCheck(),
        dests: new Map(),
      };
    }
    if (viewPly.value !== null && canBrowse.value) {
      const k = viewPly.value;
      const mv = k >= 0 ? history.value[k] : null;
      const fen = mv ? mv.after : (history.value[0]?.before ?? live.fen());
      const c = new Chess(fen);
      return {
        fen,
        orientation,
        turnColor: cg(c.turn()),
        lastMove: mv ? [mv.from, mv.to] : undefined,
        check: c.inCheck(),
        dests: new Map(),
      };
    }
    const last = history.value[history.value.length - 1];
    const canMove = (phase.value === 'user' || phase.value === 'advice') && live.turn() === userColor.value;
    return {
      fen: live.fen(),
      orientation,
      turnColor: cg(live.turn()),
      lastMove: last ? [last.from, last.to] : undefined,
      check: live.inCheck(),
      dests: canMove ? destsOf(live) : new Map(),
    };
  });

  const shapes = computed<DrawShape[]>(() => {
    if (!override.value && viewPly.value !== null && canBrowse.value) {
      const next = history.value[viewPly.value + 1];
      return next ? [{ orig: next.from, dest: next.to, brush: 'paleBlue' }] : [];
    }
    return liveShapes.value;
  });

  function bumpPosition(): void {
    triggerRef(chess);
  }

  // ---- game flow ---------------------------------------------------------
  async function newGame(): Promise<void> {
    if (!enginesReady.value || !player || !analyst) return;
    token++;
    const s = settingsStore.settings;
    const color: Color = s.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : s.color;
    userColor.value = color;
    levelPlayed.value = s.level;
    const game = new Chess();
    const engineName = `Stockfish niv. ${s.level}`;
    game.setHeader('Event', 'Partie coachée');
    game.setHeader('Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'));
    game.setHeader('White', color === 'w' ? 'Moi' : engineName);
    game.setHeader('Black', color === 'b' ? 'Moi' : engineName);
    game.setHeader('TimeControl', s.tc);
    chess.value = game;
    const tc = TIME_CONTROLS[s.tc];
    clock.value = new ChessClock(tc.minutes * 60000, tc.increment * 1000);
    issues.splice(0);
    engineErrors.clear();
    moveEvals.splice(0);
    afterByPly.clear();
    hints.value = 0;
    currentIssue.value = null;
    reviewIssue.value = null;
    advice.value = null;
    result.value = null;
    viewPly.value = null;
    override.value = null;
    liveShapes.value = [];
    analyst.reset();
    phase.value = 'engine';
    await player.newGame();
    startTicker();
    void settingsStore.saveSettings();
    if (color === 'w') beginUserTurn();
    else void engineTurn();
  }

  function beginUserTurn(): void {
    viewPly.value = null;
    phase.value = 'user';
    override.value = null;
    clock.value.start(userColor.value);
    analyst?.start(chess.value.fen());
  }

  function engineThinkTime(): number {
    const ply = history.value.length;
    const remaining = clock.value.remaining(engineColor.value);
    const scale = Math.min(1.5, Math.max(0.4, clock.value.initialMs / 600000));
    let ms = (ply < 12 ? rand(400, 1300) : rand(1200, 4200)) * scale;
    if (remaining < 60000) ms = Math.min(ms, rand(300, 1100));
    if (remaining < 15000) ms = 150;
    return ms;
  }

  async function engineTurn(): Promise<void> {
    if (!player) return;
    const t = token;
    phase.value = 'engine';
    const color = engineColor.value;
    clock.value.start(color);
    const started = performance.now();
    const level = levelConfig(levelPlayed.value);
    const cap = Math.round(Math.max(200, Math.min(4000, clock.value.remaining(color) / 30)));
    const res = await player.search(chess.value.fen(), `go depth ${level.depth} movetime ${cap}`, {
      multipv: level.k,
    }).promise;
    if (t !== token || phase.value !== 'engine') return;
    const uci = pickEngineMove(res, levelPlayed.value, chess.value);
    const target = engineThinkTime();
    const elapsed = performance.now() - started;
    if (target > elapsed) await sleep(target - elapsed);
    if (t !== token || phase.value !== 'engine') return;
    clock.value.stop();
    if (clock.value.remaining(color) <= 0) return onFlag(color);
    if (!uci) return finishByRules();
    try {
      chess.value.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    } catch (e) {
      console.error('engine returned an illegal move', uci, e);
      chess.value.move(chess.value.moves()[0]);
    }
    clock.value.addIncrement(color);
    bumpPosition();
    if (chess.value.isGameOver()) return finishByRules();
    beginUserTurn();
  }

  function finishByRules(): void {
    const c = chess.value;
    if (c.isCheckmate()) void endGame(c.turn() === userColor.value ? 'loss' : 'win', 'échec et mat');
    else if (c.isStalemate()) void endGame('draw', 'pat');
    else if (c.isThreefoldRepetition()) void endGame('draw', 'triple répétition');
    else if (c.isInsufficientMaterial()) void endGame('draw', 'matériel insuffisant');
    else void endGame('draw', 'règle des 50 coups');
  }

  function requestPromotion(color: Color): Promise<PieceType> {
    promotionColor.value = color;
    return new Promise((resolve) => (resolvePromotion = resolve));
  }

  function choosePromotion(piece: PieceType): void {
    promotionColor.value = null;
    resolvePromotion?.(piece);
    resolvePromotion = null;
  }

  async function onUserMove(orig: Square, dest: Square): Promise<void> {
    if (!(phase.value === 'user' || phase.value === 'advice') || !analyst) {
      bumpPosition();
      return;
    }
    const t = token;
    const c = chess.value;
    const piece = c.get(orig);
    let promotion: PieceType | undefined;
    if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
      promotion = await requestPromotion(userColor.value);
      if (t !== token) return;
    }
    const fenBefore = c.fen();
    const sanBefore = c.history();
    let move: Move;
    try {
      move = c.move({ from: orig, to: dest, promotion });
    } catch {
      bumpPosition();
      return;
    }
    clock.value.stop();
    advice.value = null;
    liveShapes.value = [];
    phase.value = 'checking';
    bumpPosition();

    const ev = await evaluateUserMove(fenBefore, move);
    if (t !== token) return;

    const ply = sanBefore.length;
    moveEvals.push({
      ply,
      acc: ev.verdict.acc,
      wpBefore: ev.verdict.wpBefore,
      wpAfter: ev.verdict.wpAfter,
      cls: ev.verdict.cls,
    });
    const opp = recordOpponentError(ply, ev.bestScore, ev.verdict.loss);
    afterByPly.set(ply, ev.afterScore);
    if (ev.verdict.cls) {
      const issue = makeIssue(ev, move, fenBefore, sanBefore);
      if (opp && ev.verdict.loss >= 0.1) issue.opp = opp;
      issues.push(issue);
      const live = issues[issues.length - 1];
      if (CLASS_INFO[live.cls].rank >= THRESHOLD[settingsStore.settings.coachOn]) {
        startCoaching(live);
        return;
      }
      live.status = 'silent';
    }
    proceedAfterUserMove();
  }

  function proceedAfterUserMove(): void {
    if (chess.value.isGameOver()) return finishByRules();
    clock.value.addIncrement(userColor.value);
    void engineTurn();
  }

  interface Evaluation {
    verdict: ReturnType<typeof judgeMove>;
    bestScore: Score;
    afterScore: Score;
    lines: InfoLine[];
    refutation: string[];
    fenAfter: string;
  }

  async function evaluateUserMove(fenBefore: string, move: Move): Promise<Evaluation> {
    const pre = await analyst!.ensure(fenBefore, 10);
    const lines = pre.lines;
    const best = lines[0];
    const bestScore = lineScore(best);
    const uci = uciOf(move);
    const fenAfter = chess.value.fen();
    let afterScore: Score = bestScore;
    let refutation: string[] = [];
    const matched = lines.find((l) => l.pv[0] === uci);
    if (matched) {
      afterScore = lineScore(matched);
      refutation = matched.pv.slice(1);
    } else if (chess.value.isCheckmate()) {
      afterScore = { cp: null, mate: 1 };
    } else if (chess.value.isGameOver()) {
      afterScore = { cp: 0, mate: null };
    } else {
      const reply = await analyst!.evaluate(fenAfter);
      if (reply) {
        afterScore = negate(lineScore(reply));
        refutation = reply.pv;
      }
    }
    const verdict = judgeMove(bestScore, afterScore, best.pv[0] === uci);
    return { verdict, bestScore, afterScore, lines, refutation, fenAfter };
  }

  function recordOpponentError(ply: number, bestNow: Score, userLoss: number): OpponentError | null {
    const prevAfter = afterByPly.get(ply - 2);
    if (!prevAfter || ply < 1) return null;
    const cls = opponentErrorClass(prevAfter, bestNow);
    const engineMove = history.value[ply - 1];
    if (!cls || !engineMove) return null;
    const missed = userLoss >= 0.1;
    const existing = engineErrors.get(ply - 1);
    if (existing) {
      if (!missed) existing.exploited = true;
      return existing;
    }
    const rec: OpponentError = {
      ply: ply - 1,
      san: engineMove.san,
      from: engineMove.from,
      to: engineMove.to,
      cls,
      before: prevAfter,
      after: bestNow,
      missedFirst: missed,
      exploited: !missed,
    };
    engineErrors.set(ply - 1, rec);
    return engineErrors.get(ply - 1)!;
  }

  function makeIssue(ev: Evaluation, move: Move, fenBefore: string, sanBefore: string[]): Issue {
    const ply = sanBefore.length;
    return {
      id: `${ply}-${Date.now()}`,
      ply,
      moveLabel: `${moveNumberLabel(ply)} ${frSan(move.san)}`,
      san: move.san,
      uci: uciOf(move),
      from: move.from,
      to: move.to,
      fenBefore,
      fenAfter: ev.fenAfter,
      cls: ev.verdict.cls!,
      missedMate: ev.verdict.missedMate,
      bestScore: ev.bestScore,
      afterScore: ev.afterScore,
      wpBefore: ev.verdict.wpBefore,
      wpAfter: ev.verdict.wpAfter,
      bestUci: ev.lines[0].pv[0],
      bestSan: uciLineToSan(fenBefore, [ev.lines[0].pv[0]])[0] ?? '',
      topLines: ev.lines.slice(0, 3).map((l) => ({
        uci: l.pv[0],
        text: formatLine(fenBefore, uciLineToSan(fenBefore, l.pv, 8)),
        eval: formatScore(lineScore(l)),
      })),
      refutationUci: ev.refutation,
      refutationText: (() => {
        const san = uciLineToSan(ev.fenAfter, ev.refutation, 8);
        return san.length ? formatLine(ev.fenAfter, san) : '';
      })(),
      hanging: hangingPieces(new Chess(ev.fenAfter), userColor.value),
      recent: movesText(sanBefore, 12),
      opp: null,
      status: 'open',
      solutionShown: false,
      coach: emptyAnswer(),
    };
  }

  // ---- coaching after an error ------------------------------------------
  function promptContext(): PromptContext {
    return { userColor: userColor.value, rating: settingsStore.rating };
  }

  function hintShapes(issue: Issue): DrawShape[] {
    if (issue.opp) return [{ orig: issue.opp.from, dest: issue.opp.to, brush: 'yellow' }];
    const r = issue.refutationUci[0];
    return r ? [{ orig: r.slice(0, 2) as Square, brush: 'red' }] : [];
  }

  function solutionShapes(issue: Issue): DrawShape[] {
    return [
      { orig: issue.from, dest: issue.to, brush: 'red' },
      {
        orig: issue.bestUci.slice(0, 2) as Square,
        dest: issue.bestUci.slice(2, 4) as Square,
        brush: 'green',
      },
    ];
  }

  function showHint(issue: Issue): void {
    // Missed opportunities are shown on the position before the user's move.
    override.value = issue.opp
      ? { fen: issue.fenBefore, lastMove: [issue.opp.from, issue.opp.to] }
      : { fen: issue.fenAfter, lastMove: [issue.from, issue.to] };
    liveShapes.value = hintShapes(issue);
  }

  function startCoaching(issue: Issue): void {
    viewPly.value = null;
    phase.value = 'coaching';
    currentIssue.value = issue;
    showHint(issue);
    void requestIssueCoach(issue);
  }

  function requestIssueCoach(issue: Issue): Promise<void> {
    return runCoach(
      settingsStore.coachProvider(),
      mistakePrompt(issue, promptContext()),
      MISTAKE_LABELS,
      settingsStore.settings.coachTier,
      issue.coach,
      settingsStore.disableCoach,
    );
  }

  function showSolution(): void {
    const issue = currentIssue.value;
    if (!issue) return;
    issue.solutionShown = true;
    if (phase.value === 'coaching') {
      override.value = { fen: issue.fenBefore };
      liveShapes.value = solutionShapes(issue);
    }
  }

  function retryMove(): void {
    const issue = currentIssue.value;
    if (!issue || phase.value !== 'coaching') return;
    issue.status = 'retried';
    chess.value.undo();
    bumpPosition();
    beginUserTurn();
    liveShapes.value = issue.solutionShown ? [solutionShapes(issue)[1]] : issue.opp ? hintShapes(issue) : [];
  }

  function continueGame(): void {
    const issue = currentIssue.value;
    if (!issue || phase.value !== 'coaching') return;
    issue.status = 'continued';
    override.value = null;
    liveShapes.value = [];
    phase.value = 'engine';
    proceedAfterUserMove();
  }

  // ---- on-demand advice --------------------------------------------------
  async function requestAdvice(): Promise<void> {
    if (phase.value !== 'user' || !analyst) return;
    const t = token;
    clock.value.stop();
    viewPly.value = null;
    phase.value = 'advice';
    hints.value++;
    currentIssue.value = null;
    const fen = chess.value.fen();
    const state = reactive<AdviceState>({
      fen,
      prompt: '',
      lines: null,
      answer: emptyAnswer(),
      engineHintShown: false,
      bestShown: false,
    });
    advice.value = state;
    state.answer.status = 'loading';
    const a = await analyst.waitForDepth(fen, 12, 4000);
    if (t !== token || advice.value !== state) return;
    state.lines = a.lines;
    const topLines = a.lines
      .slice(0, 3)
      .map((l) => `${formatLine(fen, uciLineToSan(fen, l.pv, 8))} (éval ${formatScore(lineScore(l))})`);
    state.prompt = advicePrompt(fen, topLines, chess.value.history(), promptContext());
    await retryAdviceCoach();
  }

  function retryAdviceCoach(): Promise<void> {
    const state = advice.value;
    if (!state?.prompt) return Promise.resolve();
    return runCoach(
      settingsStore.coachProvider(),
      state.prompt,
      ADVICE_LABELS,
      settingsStore.settings.coachTier,
      state.answer,
      settingsStore.disableCoach,
    );
  }

  function showAdviceEngineHint(): void {
    const a = advice.value;
    if (!a?.lines?.length) return;
    a.engineHintShown = true;
    liveShapes.value = [{ orig: a.lines[0].pv[0].slice(0, 2) as Square, brush: 'green' }];
  }

  function showAdviceBest(): void {
    const a = advice.value;
    if (!a?.lines?.length) return;
    a.bestShown = true;
    const u = a.lines[0].pv[0];
    liveShapes.value = [{ orig: u.slice(0, 2) as Square, dest: u.slice(2, 4) as Square, brush: 'green' }];
  }

  function resumeFromAdvice(): void {
    if (phase.value !== 'advice') return;
    advice.value = null;
    liveShapes.value = [];
    phase.value = 'user';
    clock.value.start(userColor.value);
  }

  // ---- history browsing --------------------------------------------------
  function goToPly(ply: number): void {
    if (!canBrowse.value) return;
    const last = history.value.length - 1;
    reviewIssue.value = null;
    override.value = null;
    if (phase.value === 'over') liveShapes.value = [];
    const target = Math.max(-1, Math.min(last, ply));
    viewPly.value = target >= last ? null : target;
  }

  function navigate(action: 'first' | 'prev' | 'next' | 'last'): void {
    const last = history.value.length - 1;
    const cur = viewPly.value ?? last;
    if (action === 'first') goToPly(-1);
    else if (action === 'prev') goToPly(cur - 1);
    else if (action === 'next') goToPly(cur + 1);
    else goToPly(last);
  }

  // ---- end of game -------------------------------------------------------
  async function endGame(outcome: Outcome, reason: string): Promise<void> {
    if (phase.value === 'over') return;
    token++;
    phase.value = 'over';
    clock.value.stop();
    analyst?.stop();
    advice.value = null;
    currentIssue.value = null;
    viewPly.value = null;
    override.value = null;
    liveShapes.value = [];
    const stats = computeStats(moveEvals, issues, [...engineErrors.values()]);
    const s = settingsStore.settings;
    const adapt = adaptLevel(s.level, outcome, stats);
    const levelBefore = s.level;
    const levelAfter = s.adaptive ? adapt.level : levelBefore;
    s.level = levelAfter;
    const white = userColor.value === 'w';
    chess.value.setHeader(
      'Result',
      outcome === 'draw' ? '1/2-1/2' : (outcome === 'win') === white ? '1-0' : '0-1',
    );
    const r = reactive<GameResult>({
      outcome,
      reason,
      stats,
      levelBefore,
      levelAfter,
      levelNote: s.adaptive ? adapt.note : '',
      summary: emptyAnswer(),
    });
    result.value = r;
    void settingsStore.saveSettings();
    void settingsStore.addGame({
      date: new Date().toISOString(),
      color: userColor.value,
      tc: s.tc,
      level: levelBefore,
      levelAfter,
      result: outcome,
      reason,
      accuracy: stats.accuracy !== null ? Math.round(stats.accuracy) : null,
      accuracyFinal: stats.accuracyFinal !== null ? Math.round(stats.accuracyFinal) : null,
      counts: stats.counts,
      retried: stats.retried,
      hints: hints.value,
      oppErrors: stats.oppErrors,
      oppMissed: stats.oppMissed,
      plies: history.value.length,
      themes: issues.map((i) => i.coach.sections['THEME']).filter((x): x is string => !!x),
      pgn: chess.value.pgn(),
    });
    summaryRequest = summaryPrompt(
      { outcome, reason, stats, hints: hints.value, finalHistory: chess.value.history(), issues },
      promptContext(),
    );
    // Not awaited: leaving the game must not wait for the review.
    void retrySummary();
  }

  function retrySummary(): Promise<void> {
    const r = result.value;
    if (!r || !summaryRequest) return Promise.resolve();
    return runCoach(
      settingsStore.coachProvider(),
      summaryRequest,
      SUMMARY_LABELS,
      settingsStore.settings.coachTier,
      r.summary,
      settingsStore.disableCoach,
    );
  }

  function reviewError(issue: Issue): void {
    viewPly.value = null;
    reviewIssue.value = issue;
    override.value = { fen: issue.fenBefore };
    liveShapes.value = solutionShapes(issue);
  }

  function backToFinal(): void {
    reviewIssue.value = null;
    override.value = null;
    liveShapes.value = [];
  }

  async function resign(): Promise<void> {
    if (!ACTIVE_PHASES.includes(phase.value)) return;
    const ok = await dialog.ask('Abandonner la partie ?', [
      { label: 'Annuler', value: false },
      { label: 'Abandonner', value: true, primary: true },
    ]);
    if (ok && phase.value !== 'over') await endGame('loss', 'abandon');
  }

  async function offerDraw(): Promise<void> {
    if (phase.value !== 'user' || !analyst) return;
    const a = analyst.get(chess.value.fen());
    const userCp = a?.lines[0] ? scoreCp(lineScore(a.lines[0])) : 0;
    const early = history.value.length < 20;
    if (!early && userCp >= -30) {
      const ok = await dialog.ask('Le moteur accepte la nulle. On arrête là ?', [
        { label: 'Non, je continue', value: false },
        { label: 'Oui, nulle', value: true, primary: true },
      ]);
      if (ok && phase.value === 'user') await endGame('draw', 'nulle d’un commun accord');
    } else {
      await dialog.ask(
        early
          ? 'Le moteur refuse la nulle : la partie vient de commencer.'
          : 'Le moteur refuse la nulle : il estime avoir l’avantage.',
        [{ label: 'OK', value: true, primary: true }],
      );
    }
  }

  /** Leaves the current game (counted as resigned) and returns to the setup screen. */
  async function leaveGame(): Promise<boolean> {
    if (ACTIVE_PHASES.includes(phase.value)) {
      const ok = await dialog.ask('Quitter la partie en cours ? Elle sera comptée comme abandonnée.', [
        { label: 'Annuler', value: false },
        { label: 'Quitter', value: true, primary: true },
      ]);
      if (!ok) return false;
      await endGame('loss', 'abandon');
    }
    phase.value = 'setup';
    return true;
  }

  return {
    // state
    phase,
    chess,
    userColor,
    engineColor,
    levelPlayed,
    issues,
    engineErrors,
    hints,
    currentIssue,
    reviewIssue,
    advice,
    result,
    viewPly,
    history,
    board,
    shapes,
    promotionColor,
    engineStatus,
    enginesReady,
    canBrowse,
    // clock
    clockMs,
    clockRunning: computed(() => {
      void tick.value;
      return clock.value.running;
    }),
    // actions
    initEngines,
    newGame,
    onUserMove,
    choosePromotion,
    showSolution,
    retryMove,
    continueGame,
    requestIssueCoach,
    requestAdvice,
    retryAdviceCoach,
    retrySummary,
    showAdviceEngineHint,
    showAdviceBest,
    resumeFromAdvice,
    goToPly,
    navigate,
    reviewError,
    backToFinal,
    resign,
    offerDraw,
    leaveGame,
  };
});
