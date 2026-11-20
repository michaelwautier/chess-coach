import { defineStore } from 'pinia';
import { Chess, type Move } from 'chess.js';
import { moveSound, playSound } from '@/audio/sounds';
import { computed, ref } from 'vue';
import { formatLine, uciLineToSan } from '@/chess/notation';
import {
  drillFromIssue,
  dueDrills,
  gradeDrill,
  mergeDrills,
  nextDue,
  solves,
  type Drill,
} from '@/game/drills';
import type { Issue } from '@/game/types';
import { useGameStore } from './game';
import { useSettingsStore } from './settings';

/** Exercises per session, the most overdue first. */
const SESSION_SIZE = 10;

export type DrillState = 'solving' | 'checking' | 'right' | 'wrong' | 'revealed';

export interface DrillSession {
  queue: Drill[];
  index: number;
  state: DrillState;
  /** The first answer (or showing the solution) grades the exercise; later tries do not. */
  graded: boolean;
  hintShown: boolean;
  /** Last move tried, and the engine's answer to it when it was wrong. */
  answer: { uci: string; san: string; fenAfter: string; refutation: string; refutationUci: string } | null;
  notice: string;
  solved: number;
  done: number;
}

export const useDrillsStore = defineStore('drills', () => {
  const settings = useSettingsStore();
  const drills = ref<Drill[]>([]);
  const loaded = ref(false);
  /** Reference time for what is due; refreshed when the list is loaded and between sessions. */
  const now = ref(Date.now());
  const session = ref<DrillSession | null>(null);

  const due = computed(() => dueDrills(drills.value, now.value));
  const next = computed(() => nextDue(drills.value));
  const current = computed(() => {
    const s = session.value;
    return s ? (s.queue[s.index] ?? null) : null;
  });

  async function load(): Promise<void> {
    drills.value = await settings.loadDrills();
    now.value = Date.now();
    loaded.value = true;
  }

  function save(): Promise<void> {
    return settings.saveDrills(JSON.parse(JSON.stringify(drills.value)) as Drill[]);
  }

  /** Turns a finished game's mistakes, blunders and missed chances into exercises. */
  async function addFromGame(source: string, issues: Issue[]): Promise<void> {
    const t = Date.now();
    const added = issues.map((i) => drillFromIssue(i, source, t)).filter((d): d is Drill => !!d);
    if (!added.length) return;
    // Never overwrite the stored list with an empty one that was not loaded yet.
    if (!loaded.value) await load();
    drills.value = mergeDrills(drills.value, added);
    await save();
  }

  function start(): void {
    now.value = Date.now();
    const queue = dueDrills(drills.value, now.value).slice(0, SESSION_SIZE);
    if (!queue.length) return;
    session.value = {
      queue,
      index: 0,
      state: 'solving',
      graded: false,
      hintShown: false,
      answer: null,
      notice: '',
      solved: 0,
      done: 0,
    };
    useGameStore().startAnalysis(queue[0].fen);
  }

  function grade(correct: boolean): void {
    const s = session.value;
    const d = current.value;
    if (!s || !d || s.graded) return;
    s.graded = true;
    s.done++;
    if (correct) s.solved++;
    const updated = gradeDrill(d, correct, Date.now());
    drills.value = drills.value.map((x) => (x.id === d.id ? updated : x));
    void save();
  }

  /** Checks a move: the best move at once, any other with the engine. */
  async function play(uci: string): Promise<void> {
    const s = session.value;
    const d = current.value;
    if (!s || !d || s.state !== 'solving') return;
    const after = new Chess(d.fen);
    let move: Move;
    try {
      move = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined });
    } catch {
      return;
    }
    playSound(moveSound(move));
    const san = uciLineToSan(d.fen, [uci])[0] ?? uci;
    s.answer = { uci, san, fenAfter: after.fen(), refutation: '', refutationUci: '' };
    s.notice = '';
    if (uci === d.bestUci) {
      grade(true);
      s.state = 'right';
      return;
    }
    s.state = 'checking';
    const res = await useGameStore().judgeCandidate(d.fen, uci);
    if (session.value !== s || current.value !== d || s.state !== 'checking') return;
    if (!res) {
      s.state = 'solving';
      s.answer = null;
      s.notice = 'Le moteur n’est pas prêt : réessaie dans un instant.';
      return;
    }
    const ok = solves(res.verdict);
    grade(ok);
    if (ok) {
      s.state = 'right';
      return;
    }
    s.state = 'wrong';
    s.answer.refutationUci = res.refutation[0] ?? '';
    const reply = uciLineToSan(s.answer.fenAfter, res.refutation, 6);
    s.answer.refutation = reply.length ? formatLine(s.answer.fenAfter, reply) : '';
  }

  function showHint(): void {
    if (session.value) session.value.hintShown = true;
  }

  function retry(): void {
    const s = session.value;
    if (s?.state !== 'wrong') return;
    s.state = 'solving';
    s.answer = null;
  }

  function reveal(): void {
    const s = session.value;
    if (!s || !current.value) return;
    grade(false);
    s.state = 'revealed';
  }

  function nextDrill(): void {
    const s = session.value;
    if (!s) return;
    s.index++;
    s.state = 'solving';
    s.graded = false;
    s.hintShown = false;
    s.answer = null;
    s.notice = '';
    const d = current.value;
    if (d) useGameStore().startAnalysis(d.fen);
    else useGameStore().stopAnalysis();
  }

  function quit(): void {
    useGameStore().stopAnalysis();
    session.value = null;
    now.value = Date.now();
  }

  /** The exercise as stored after it was graded (for its next date). */
  const currentStored = computed(() => {
    const d = current.value;
    return d ? (drills.value.find((x) => x.id === d.id) ?? d) : null;
  });

  return {
    drills,
    loaded,
    session,
    due,
    next,
    current,
    currentStored,
    load,
    addFromGame,
    start,
    play,
    showHint,
    retry,
    reveal,
    nextDrill,
    quit,
  };
});
