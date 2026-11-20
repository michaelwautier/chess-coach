<script setup lang="ts">
import { computed, onMounted, watchEffect } from 'vue';
import { PIECE_SETS, applyAppearance } from './appearance/themes';
import ConfirmDialog from './components/ConfirmDialog.vue';
import DrillView from './components/DrillView.vue';
import GameView from './components/GameView.vue';
import SetupView from './components/SetupView.vue';
import { useDrillsStore } from './stores/drills';
import { useGameStore } from './stores/game';
import { useSettingsStore } from './stores/settings';

const game = useGameStore();
const settings = useSettingsStore();
const drills = useDrillsStore();

watchEffect(() => applyAppearance(settings.settings));

onMounted(() => {
  void settings.init().then(() => drills.load());
  void game.initEngines();
});

const engineChip = computed(() =>
  game.enginesReady ? 'ok' : game.engineStatus.includes('pas pu') ? 'bad' : '',
);
const coachChip = computed(() =>
  settings.activeProviderId && !settings.coachDisabled ? 'ok' : settings.ready ? 'warn' : '',
);

const pieceCredit = computed(() => {
  const set = PIECE_SETS.find((p) => p.id === settings.settings.pieceSet);
  return set ? `${set.label}, par ${set.author} (${set.license})` : '';
});

async function openSettings(): Promise<void> {
  await game.leaveGame();
}
</script>

<template>
  <header class="top">
    <h1>♞ Coach Chess</h1>
    <span class="chip" :class="engineChip">{{ game.engineStatus }}</span>
    <span class="chip" :class="coachChip">{{ settings.coachLabel }}</span>
    <span class="spacer" />
    <button v-if="game.phase !== 'setup'" class="btn" @click="openSettings">⚙︎ Réglages</button>
  </header>
  <main>
    <DrillView v-if="drills.session" />
    <SetupView v-else-if="game.phase === 'setup'" />
    <GameView v-else @settings="openSettings" />
  </main>
  <ConfirmDialog />
  <footer>
    Moteur : <a href="https://github.com/nmrugg/stockfish.js">Stockfish.js</a> (GPLv3). Échiquier :
    <a href="https://github.com/lichess-org/chessground">chessground</a> (GPLv3). Pièces : {{ pieceCredit }}.
    Règles : <a href="https://github.com/jhlywa/chess.js">chess.js</a>. Les explications sont générées par une
    IA à partir de l'analyse du moteur et peuvent contenir des erreurs.
  </footer>
</template>

<style scoped>
header.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}
h1 {
  margin: 0 6px 0 0;
  font-size: 16px;
}
.spacer {
  flex: 1;
}
main {
  padding: 10px;
}
footer {
  max-width: 1060px;
  margin: 18px auto 24px;
  padding: 0 12px;
  font-size: 11.5px;
  color: var(--muted);
}
</style>
