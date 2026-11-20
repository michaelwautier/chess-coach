<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { CLASS_INFO, colorName } from '@/chess/constants';
import { frSan, moveNumberLabel } from '@/chess/notation';
import { materialBalance } from '@/chess/position';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';
import AdvicePanel from './AdvicePanel.vue';
import ChessBoard from './ChessBoard.vue';
import CoachPanel from './CoachPanel.vue';
import GameOverPanel from './GameOverPanel.vue';
import HistoryNav from './HistoryNav.vue';
import MoveList, { type MoveMark } from './MoveList.vue';
import PlayerBar from './PlayerBar.vue';
import PromotionPicker from './PromotionPicker.vue';

const game = useGameStore();
const settings = useSettingsStore();
const emit = defineEmits<{ settings: [] }>();

const material = computed(() => materialBalance(game.board.fen));
const advantage = (color: 'w' | 'b') => (color === 'w' ? material.value.diff : -material.value.diff);
const paused = computed(() => ['coaching', 'advice', 'checking'].includes(game.phase));
const active = computed(() => ['user', 'engine', 'advice', 'coaching', 'checking'].includes(game.phase));

const lastPly = computed(() => game.history.length - 1);
const currentPly = computed(() => game.viewPly ?? lastPly.value);

const marks = computed(() => {
  const map = new Map<number, MoveMark>();
  for (const e of game.engineErrors.values())
    map.set(e.ply, { mark: CLASS_INFO[e.cls].mark, cls: e.cls, opponent: true });
  for (const i of game.issues) {
    if (i.status === 'continued' || i.status === 'silent') {
      map.set(i.ply, { mark: CLASS_INFO[i.cls].mark, cls: i.cls, opponent: false });
    }
  }
  return map;
});

const PIECE_FR = { p: 'pion', n: 'cavalier', b: 'fou', r: 'tour', q: 'dame', k: 'roi' } as const;

const status = computed(() => {
  if (game.viewPly !== null && game.canBrowse) {
    const k = game.viewPly;
    const clockNote = game.clockRunning === game.userColor ? ' · ta pendule tourne' : '';
    if (k < 0)
      return { text: `Position de départ · flèche bleue = coup suivant${clockNote}`, cls: 'browsing' };
    const mv = game.history[k];
    const mine = mv.color === game.userColor;
    const capture = mv.captured
      ? ` : ${mine ? 'tu prends son' : "l'adversaire prend ton"} ${PIECE_FR[mv.captured]} en ${mv.to}`
      : '';
    return {
      text: `Position après ${moveNumberLabel(k)} ${frSan(mv.san)}${capture}${clockNote}`,
      cls: 'browsing',
    };
  }
  const texts: Record<string, string> = {
    user: 'À toi de jouer',
    engine: 'Le moteur réfléchit…',
    checking: 'Vérification de ton coup…',
    coaching: '⏸ Pendule en pause : regarde le coach',
    advice: '⏸ Pendule en pause : conseil',
    over: game.replay ? 'Revue d’une partie passée' : 'Partie terminée',
  };
  return { text: texts[game.phase] ?? '', cls: game.phase };
});

function onKey(e: KeyboardEvent): void {
  if ((e.target as HTMLElement).closest('input, textarea')) return;
  if (e.key === 'ArrowLeft') game.navigate('prev');
  else if (e.key === 'ArrowRight') game.navigate('next');
  else return;
  e.preventDefault();
}
onMounted(() => document.addEventListener('keydown', onKey));
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <section class="game">
    <div class="board-column">
      <PlayerBar
        :name="`Stockfish · niveau ${game.levelPlayed}`"
        :captured="material.captured[game.engineColor]"
        :advantage="advantage(game.engineColor)"
        :time-ms="game.replay ? null : game.clockMs(game.engineColor)"
        :running="game.clockRunning === game.engineColor"
        :paused="false"
        :color="game.engineColor"
      />
      <div class="board-wrap">
        <ChessBoard :view="game.board" :shapes="game.shapes" @move="game.onUserMove" />
        <PromotionPicker
          v-if="game.promotionColor"
          :color="game.promotionColor"
          @choose="game.choosePromotion"
        />
      </div>
      <PlayerBar
        :name="`Toi (${colorName(game.userColor)})`"
        :captured="material.captured[game.userColor]"
        :advantage="advantage(game.userColor)"
        :time-ms="game.replay ? null : game.clockMs(game.userColor)"
        :running="game.clockRunning === game.userColor"
        :paused="paused"
        :color="game.userColor"
      />
      <HistoryNav
        v-if="game.canBrowse && game.history.length"
        :at-start="currentPly < 0"
        :at-end="game.viewPly === null"
        @navigate="game.navigate"
      />
      <div class="status" :class="status.cls">{{ status.text }}</div>
    </div>

    <div class="side-column">
      <div v-if="active" class="actions">
        <button class="btn hint" :disabled="game.phase !== 'user'" @click="game.requestAdvice()">
          💡 Conseil
        </button>
        <button class="btn" :disabled="game.phase !== 'user'" @click="game.offerDraw()">½ Nulle</button>
        <button class="btn" @click="game.resign()">🏳 Abandon</button>
      </div>

      <AdvicePanel
        v-if="game.phase === 'advice' && game.advice"
        :advice="game.advice"
        @resume="game.resumeFromAdvice()"
        @engine-hint="game.showAdviceEngineHint()"
        @best="game.showAdviceBest()"
        @recoach="game.retryAdviceCoach()"
      />
      <CoachPanel
        v-else-if="game.reviewIssue || game.currentIssue"
        :issue="(game.reviewIssue ?? game.currentIssue)!"
        :live="!game.reviewIssue && game.phase === 'coaching'"
        :review="!!game.reviewIssue"
        :undoable="!game.reviewIssue && game.canUndoContinue"
        @retry="game.retryMove()"
        @solution="game.showSolution()"
        @continue="game.continueGame()"
        @undo="game.undoContinue()"
        @recoach="game.requestIssueCoach((game.reviewIssue ?? game.currentIssue)!)"
        @back="game.backToFinal()"
      />

      <GameOverPanel
        v-if="game.phase === 'over' && game.result"
        :result="game.result"
        :issues="game.issues"
        :hints="game.hints"
        :adaptive="settings.settings.adaptive"
        :pgn="game.chess.pgn()"
        :replay="game.replay"
        @review="game.reviewError"
        @again="game.newGame()"
        @settings="emit('settings')"
        @resummarize="game.retrySummary()"
      />

      <MoveList
        :moves="game.history.map((m) => m.san)"
        :marks="marks"
        :current="currentPly"
        @select="game.goToPly"
      />
    </div>
  </section>
</template>

<style scoped>
.game {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}
.board-column {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 280px;
  max-width: min(560px, calc(100svh - 230px));
  margin: 0 auto;
}
.side-column {
  display: grid;
  gap: 10px;
  align-content: start;
}
/* Desktop: the board takes as much room as the window height allows, the side column the rest of the width. */
@media (min-width: 900px) {
  .game {
    --board-size: max(320px, min(calc(100svh - 236px), calc(100vw - 420px)));
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
.status {
  min-height: 20px;
  text-align: center;
  font-size: 13.5px;
  color: var(--muted);
}
.status.user {
  color: var(--good);
}
.status.coaching,
.status.advice {
  color: var(--advice);
}
.status.browsing {
  color: var(--inaccuracy);
}
.actions {
  display: flex;
  gap: 8px;
}
.actions .btn {
  flex: 1;
  padding: 10px 8px;
  font-size: 14px;
}
.actions .hint {
  border-color: #2c4a66;
  color: var(--advice);
}
</style>
