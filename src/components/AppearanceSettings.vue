<script setup lang="ts">
import { computed } from 'vue';
import { BOARD_THEMES, PIECE_SETS, type BoardTheme } from '@/appearance/themes';
import { useSettingsStore } from '@/stores/settings';

const store = useSettingsStore();
const s = store.settings;

const ROLES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
const pieceSet = computed(() => PIECE_SETS.find((p) => p.id === s.pieceSet) ?? PIECE_SETS[0]);
const base = import.meta.env.BASE_URL;

function chooseTheme(theme: BoardTheme): void {
  s.boardTheme = theme.id;
  s.boardLight = theme.light;
  s.boardDark = theme.dark;
  void store.saveSettings();
}

function setColor(which: 'boardLight' | 'boardDark', value: string): void {
  s.boardTheme = 'custom';
  s[which] = value;
  void store.saveSettings();
}

function chooseSet(id: string): void {
  s.pieceSet = id;
  void store.saveSettings();
}
</script>

<template>
  <div class="appearance">
    <h3>Apparence</h3>

    <!-- .cg-wrap applies the current piece-set images to <piece> elements -->
    <div class="cg-wrap preview" aria-hidden="true">
      <div v-for="(role, i) in ROLES" :key="`w-${role}`" class="square" :class="i % 2 ? 'dark' : 'light'">
        <piece :class="[role, 'white']" />
      </div>
      <div v-for="(role, i) in ROLES" :key="`b-${role}`" class="square" :class="i % 2 ? 'light' : 'dark'">
        <piece :class="[role, 'black']" />
      </div>
    </div>

    <label>Plateau</label>
    <div class="themes">
      <button
        v-for="t in BOARD_THEMES"
        :key="t.id"
        type="button"
        class="theme"
        :class="{ on: s.boardTheme === t.id }"
        :title="t.label"
        @click="chooseTheme(t)"
      >
        <span
          class="swatch"
          :style="{ background: `linear-gradient(135deg, ${t.light} 50%, ${t.dark} 50%)` }"
        />
        {{ t.label }}
      </button>
    </div>
    <div class="colors">
      <label class="color">
        <input
          type="color"
          :value="s.boardLight"
          @input="setColor('boardLight', ($event.target as HTMLInputElement).value)"
        />
        Cases claires
      </label>
      <label class="color">
        <input
          type="color"
          :value="s.boardDark"
          @input="setColor('boardDark', ($event.target as HTMLInputElement).value)"
        />
        Cases foncées
      </label>
      <span v-if="s.boardTheme === 'custom'" class="muted small">Couleurs personnalisées</span>
    </div>

    <label>Pièces</label>
    <div class="sets">
      <button
        v-for="p in PIECE_SETS"
        :key="p.id"
        type="button"
        class="set"
        :class="{ on: s.pieceSet === p.id }"
        :title="`${p.label} — ${p.author} (${p.license})`"
        @click="chooseSet(p.id)"
      >
        <img :src="`${base}pieces/${p.id}/wN.svg`" alt="" />
        <span>{{ p.label }}</span>
      </button>
    </div>
    <p class="muted small">
      Pièces « {{ pieceSet.label }} » par {{ pieceSet.author }}, licence {{ pieceSet.license }}. Tous les jeux
      proposés sont libres, y compris pour un usage commercial.
    </p>
  </div>
</template>

<style scoped>
h3 {
  margin: 0 0 10px;
  font-size: 16px;
}
label {
  display: block;
  margin: 14px 0 6px;
  color: var(--muted);
  font-size: 13px;
}
.preview {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  max-width: 330px;
  border-radius: 6px;
  overflow: hidden;
}
.square {
  aspect-ratio: 1;
}
.square.light {
  background: var(--board-light);
}
.square.dark {
  background: var(--board-dark);
}
.preview piece {
  position: static;
  display: block;
  width: 100%;
  height: 100%;
}
.themes,
.sets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.theme,
.set {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px 6px 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel-2);
  cursor: pointer;
  font-size: 13px;
}
.theme.on,
.set.on {
  border-color: var(--accent);
  outline: 1px solid var(--accent);
}
.swatch {
  width: 22px;
  height: 22px;
  border-radius: 5px;
}
.set img {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: var(--board-light);
}
.colors {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
}
label.color {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text);
}
input[type='color'] {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: none;
  cursor: pointer;
}
</style>
