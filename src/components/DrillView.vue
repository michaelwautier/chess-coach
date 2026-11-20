<script setup lang="ts">
import { Chess, type Square } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import { computed } from 'vue';
import { CLASS_INFO, colorName, possessive } from '@/chess/constants';
import { frSan, pieceTypeAt } from '@/chess/notation';
import { isRetired } from '@/game/drills';
import { useDrillsStore } from '@/stores/drills';
import { useGameStore } from '@/stores/game';
import type { BoardView } from '@/stores/game';
import ChessBoard from './ChessBoard.vue';
import CoachSection from './CoachSection.vue';

const drills = useDrillsStore();
const game = useGameStore();

const s = computed(() => drills.session!);
const d = computed(() => drills.current);
const total = computed(() => s.value.queue.length);

const cg = (c: 'w' | 'b') => (c === 'w' ? 'white' : 'black');
const arrow = (uci: string, brush: string): DrawShape => ({
  orig: uci.slice(0, 2) as Square,
  dest: uci.slice(2, 4) as Square,
  brush,
});

function destsOf(chess: Chess): Map<Square, Square[]> {
  const dests = new Map<Square, Square[]>();
  for (const m of chess.moves({ verbose: true })) dests.set(m.from, [...(dests.get(m.from) ?? []), m.to]);
  return dests;
}

/** Before an answer: the exercise; after one, the position it leads to; with the solution, the exercise again. */
const board = computed<BoardView | null>(() => {
  const drill = d.value;
  if (!drill) return null;
  const answer = s.value.answer;
  const showAnswer = answer && s.value.state !== 'revealed';
  const fen = showAnswer ? answer.fenAfter : drill.fen;
  const c = new Chess(fen);
  const lastMove: [Square, Square] | undefined = showAnswer
    ? [answer.uci.slice(0, 2) as Square, answer.uci.slice(2, 4) as Square]
    : drill.opp
      ? [drill.opp.from, drill.opp.to]
      : undefined;
  return {
    fen,
    orientation: cg(drill.color),
    turnColor: cg(c.turn()),
    lastMove,
    check: c.inCheck(),
    dests: s.value.state === 'solving' ? destsOf(c) : new Map(),
  };
});

const shapes = computed<DrawShape[]>(() => {
  const drill = d.value;
  if (!drill) return [];
  const state = s.value.state;
  if (state === 'revealed') return [arrow(drill.playedUci, 'red'), arrow(drill.bestUci, 'green')];
  if (state === 'wrong' && s.value.answer?.refutationUci) return [arrow(s.value.answer.refutationUci, 'red')];
  if (state === 'solving' && s.value.hintShown)
    return [{ orig: drill.bestUci.slice(0, 2) as Square, brush: 'green' }];
  return [];
});

function onMove(orig: Square, dest: Square): void {
  const drill = d.value;
  if (!drill) return;
  const piece = new Chess(drill.fen).get(orig);
  const promotion = piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1') ? 'q' : '';
  void drills.play(`${orig}${dest}${promotion}`);
}

const badge = computed(() => {
  const drill = d.value!;
  return drill.opp ? 'Occasion manquée' : CLASS_INFO[drill.cls].label;
});

const source = computed(() => {
  const drill = d.value!;
  const day = new Date(drill.source).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  return `D'après ta partie du ${day}${drill.theme ? ` · ${drill.theme}` : ''}`;
});

const prompt = computed(() => {
  const drill = d.value!;
  const side = `Trait aux ${colorName(drill.color)}`;
  if (drill.opp) {
    return `Ton adversaire vient de jouer ${frSan(drill.opp.san)}, une ${CLASS_INFO[drill.cls].noun}. ${side} : profites-en.`;
  }
  return `${side} : trouve le meilleur coup.`;
});

const hint = computed(() => {
  const drill = d.value!;
  if (drill.hint) return drill.hint;
  const from = drill.bestUci.slice(0, 2);
  const type = pieceTypeAt(drill.fen, from);
  return `Regarde ${type ? possessive(type, 'ton') : 'la case'} en ${from} (case entourée en vert).`;
});

const verdict = computed(() => {
  const drill = d.value!;
  const answer = s.value.answer;
  if (!answer) return '';
  if (s.value.state === 'right') {
    return answer.uci === drill.bestUci
      ? `✓ Bien joué : ${frSan(answer.san)}, le meilleur coup.`
      : `✓ Bien joué : ${frSan(answer.san)} fait aussi bien. Le moteur proposait ${frSan(drill.bestSan)}.`;
  }
  if (s.value.state === 'wrong') return `✗ ${frSan(answer.san)} ne suffit pas.`;
  return '';
});

const showSolution = computed(() => s.value.state === 'right' || s.value.state === 'revealed');

const schedule = computed(() => {
  const stored = drills.currentStored;
  if (!s.value.graded || !stored) return '';
  if (isRetired(stored)) return 'Exercice acquis : il ne reviendra plus.';
  const days = Math.max(1, Math.round((stored.dueAt - Date.now()) / 86400000));
  return `Il reviendra dans ${days} jour${days > 1 ? 's' : ''}.`;
});
</script>

<template>
  <section class="drill">
    <div class="board-column">
      <div class="board-wrap">
        <ChessBoard v-if="board" :view="board" :shapes="shapes" @move="onMove" />
        <div v-else class="board-done" />
      </div>
    </div>

    <div class="side-column">
      <div class="card">
        <template v-if="d">
          <div class="head">
            <span class="badge" :class="d.cls">{{ badge }} {{ CLASS_INFO[d.cls].mark }}</span>
            <span class="count">Exercice {{ s.index + 1 }} / {{ total }}</span>
            <span class="spacer" />
            <button class="btn small-btn" @click="drills.quit()">Quitter</button>
          </div>
          <p class="muted small">{{ source }}</p>
          <p class="prompt">{{ prompt }}</p>

          <CoachSection
            v-if="s.hintShown && s.state === 'solving'"
            title="Indice"
            :text="hint"
            variant="hint"
          />
          <p v-if="s.notice" class="warn-text small">{{ s.notice }}</p>
          <p v-if="s.state === 'checking'" class="thinking">
            <span class="dots" /> Le moteur vérifie ton coup…
          </p>
          <p v-if="verdict" class="verdict" :class="s.state">{{ verdict }}</p>
          <CoachSection
            v-if="s.state === 'wrong' && s.answer?.refutation"
            title="Ce que l'adversaire répondrait"
            :text="s.answer.refutation"
            variant="refutation"
          />

          <template v-if="showSolution">
            <CoachSection title="Solution" :text="`${frSan(d.bestSan)} — suite : ${d.line}`" variant="best" />
            <p class="muted small">
              Dans ta partie, tu avais joué {{ frSan(d.playedSan)
              }}{{ s.state === 'revealed' ? ' (flèche rouge)' : '' }}.
            </p>
            <CoachSection title="À retenir" :text="d.lesson" variant="lesson" />
          </template>
          <p v-if="schedule" class="muted small">{{ schedule }}</p>

          <div class="btn-row">
            <template v-if="s.state === 'solving'">
              <button v-if="!s.hintShown" class="btn" @click="drills.showHint()">💡 Indice</button>
              <button class="btn" @click="drills.reveal()">Voir la solution</button>
            </template>
            <template v-else-if="s.state === 'wrong'">
              <button class="btn primary" @click="drills.retry()">↺ Réessayer</button>
              <button class="btn" @click="drills.reveal()">Voir la solution</button>
              <button class="btn" @click="drills.nextDrill()">Suivant ▶</button>
            </template>
            <button v-else-if="showSolution" class="btn primary" @click="drills.nextDrill()">
              Suivant ▶
            </button>
          </div>
          <p v-if="s.state === 'solving' && !game.enginesReady" class="muted small">
            {{ game.engineStatus }}
          </p>
        </template>

        <template v-else>
          <h3>Séance terminée</h3>
          <p>
            {{ s.solved }} / {{ s.done }} exercice{{ s.done > 1 ? 's' : '' }} réussi{{
              s.solved > 1 ? 's' : ''
            }}
            du premier coup.
          </p>
          <p class="muted small">
            Un exercice réussi revient de plus en plus tard (3, 7, 14 puis 30 jours, après quoi il est
            acquis), un exercice raté revient dès demain.
          </p>
          <div class="btn-row">
            <button class="btn primary" @click="drills.quit()">Retour</button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.drill {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.board-column {
  width: 100%;
  min-width: 280px;
  max-width: min(560px, calc(100svh - 160px));
  margin: 0 auto;
}
.side-column {
  display: grid;
  gap: 10px;
  align-content: start;
}
@media (min-width: 900px) {
  .drill {
    --board-size: max(320px, min(calc(100svh - 170px), calc(100vw - 420px)));
    grid-template-columns: var(--board-size) minmax(340px, 1fr);
    align-items: start;
  }
  .board-column {
    width: var(--board-size);
    max-width: none;
    margin: 0;
  }
}
.board-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
}
.board-done {
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background: var(--panel);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.count {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.small-btn {
  padding: 5px 10px;
  font-size: 13px;
}
.prompt {
  margin: 10px 0 0;
  font-size: 15.5px;
}
.verdict {
  margin: 10px 0 0;
  font-weight: 600;
}
.verdict.right {
  color: var(--good);
}
.verdict.wrong {
  color: var(--blunder);
}
h3 {
  margin: 0 0 8px;
  font-size: 16px;
}
</style>
