<script setup lang="ts">
import { computed, ref } from 'vue';
import { MAX_LEVEL, MIN_LEVEL } from '@/engine/levels';
import { TIME_CONTROLS, type CoachThreshold, type GameRecord, type Settings } from '@/game/types';
import { parseRating } from '@/storage/settings';
import { useDrillsStore } from '@/stores/drills';
import { useGameStore } from '@/stores/game';
import { useSettingsStore } from '@/stores/settings';
import AppearanceSettings from './AppearanceSettings.vue';
import ProviderSettings from './ProviderSettings.vue';

const store = useSettingsStore();
const game = useGameStore();
const drills = useDrillsStore();

const nextDrillText = computed(() => {
  const next = drills.next;
  if (next === null) return '';
  return new Date(next).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
});

const COLORS: { value: Settings['color']; label: string }[] = [
  { value: 'w', label: 'Blancs' },
  { value: 'b', label: 'Noirs' },
  { value: 'random', label: 'Au hasard' },
];
const COACH_ON: { value: CoachThreshold; label: string }[] = [
  { value: 'inaccuracy', label: 'Imprécisions et +' },
  { value: 'mistake', label: 'Erreurs et +' },
  { value: 'blunder', label: 'Gaffes' },
  { value: 'off', label: 'Jamais' },
];
const TIERS: { value: Settings['coachTier']; label: string }[] = [
  { value: 'default', label: 'Approfondies' },
  { value: 'quick', label: 'Rapides' },
];
const RESULTS = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle' } as const;

function setRating(field: 'ratingChesscom' | 'ratingLichess', value: string): void {
  store.settings[field] = parseRating(value);
}

const opening = ref('');

async function review(record: GameRecord): Promise<void> {
  opening.value = record.date;
  try {
    await game.openReplay(record);
  } finally {
    opening.value = '';
  }
}
</script>

<template>
  <section class="setup">
    <div class="card">
      <h2>Nouvelle partie</h2>
      <label>Tu joues</label>
      <div class="seg">
        <button
          v-for="c in COLORS"
          :key="c.value"
          type="button"
          :class="{ on: store.settings.color === c.value }"
          @click="store.settings.color = c.value"
        >
          {{ c.label }}
        </button>
      </div>

      <label>Cadence</label>
      <div class="seg">
        <button
          v-for="tc in Object.keys(TIME_CONTROLS) as Settings['tc'][]"
          :key="tc"
          type="button"
          :class="{ on: store.settings.tc === tc }"
          @click="store.settings.tc = tc"
        >
          {{ tc }}
        </button>
      </div>

      <label for="level"
        >Niveau du moteur : <b>{{ store.settings.level }}</b> / {{ MAX_LEVEL }}</label
      >
      <input
        id="level"
        v-model.number="store.settings.level"
        type="range"
        :min="MIN_LEVEL"
        :max="MAX_LEVEL"
        step="1"
      />
      <label class="check">
        <input v-model="store.settings.adaptive" type="checkbox" />
        Adaptatif : le niveau change après chaque partie, jamais pendant. +1 si tu gagnes, +2 si tu gagnes
        sans gaffe avec 85 % de précision ou plus, −1 si tu perds. Une victoire obtenue en rejouant une gaffe
        ne fait pas monter le niveau.
      </label>
      <p class="muted small">
        Les niveaux ne correspondent pas à un Elo garanti : le mode adaptatif sert justement à trouver le
        tien.
      </p>

      <label>Le coach t'arrête sur</label>
      <div class="seg">
        <button
          v-for="c in COACH_ON"
          :key="c.value"
          type="button"
          :class="{ on: store.settings.coachOn === c.value }"
          @click="store.settings.coachOn = c.value"
        >
          {{ c.label }}
        </button>
      </div>

      <label>Explications du coach</label>
      <div class="seg">
        <button
          v-for="t in TIERS"
          :key="t.value"
          type="button"
          :class="{ on: store.settings.coachTier === t.value }"
          @click="store.settings.coachTier = t.value"
        >
          {{ t.label }}
        </button>
      </div>

      <label>Ton classement (le coach adapte ses explications)</label>
      <div class="ratings">
        <label class="rating">
          <span>chess.com</span>
          <input
            type="number"
            inputmode="numeric"
            min="100"
            max="3500"
            placeholder="—"
            :value="store.settings.ratingChesscom ?? ''"
            @change="setRating('ratingChesscom', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="rating">
          <span>Lichess</span>
          <input
            type="number"
            inputmode="numeric"
            min="100"
            max="3500"
            placeholder="—"
            :value="store.settings.ratingLichess ?? ''"
            @change="setRating('ratingLichess', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>

      <button class="btn primary start" :disabled="!game.enginesReady" @click="game.newGame()">
        {{ game.enginesReady ? 'Lancer la partie' : game.engineStatus }}
      </button>
    </div>

    <div class="card drills">
      <h3>Exercices</h3>
      <p v-if="!drills.drills.length" class="muted small">
        Tes erreurs, tes gaffes et les occasions manquées deviendront des exercices à refaire, de plus en plus
        espacés (1, 3, 7, 14 puis 30 jours) tant que tu les réussis.
      </p>
      <template v-else>
        <p v-if="drills.due.length">
          {{ drills.due.length }} exercice{{ drills.due.length > 1 ? 's' : '' }} à faire, tiré{{
            drills.due.length > 1 ? 's' : ''
          }}
          de tes parties.
        </p>
        <p v-else-if="nextDrillText" class="muted small">
          Aucun exercice à faire pour l'instant. Prochain : {{ nextDrillText }}.
        </p>
        <p v-else class="muted small">Tous tes exercices sont acquis.</p>
        <button
          v-if="drills.due.length"
          class="btn primary"
          :disabled="!game.enginesReady"
          @click="drills.start()"
        >
          S'entraîner
        </button>
      </template>
    </div>

    <div class="card"><AppearanceSettings /></div>

    <div class="card"><ProviderSettings /></div>

    <div class="card history">
      <h3>Dernières parties</h3>
      <p v-if="!store.history.length" class="muted small">Aucune partie pour l'instant.</p>
      <div v-for="g in store.history" :key="g.date" class="history-row">
        <span>{{ new Date(g.date).toLocaleDateString('fr-FR') }}</span>
        <span :class="`result-${g.result}`">{{ RESULTS[g.result] }}</span>
        <span>niv. {{ g.level }}</span>
        <span>{{ g.accuracy ?? '—' }}{{ g.accuracy !== null && g.accuracy !== undefined ? ' %' : '' }}</span>
        <button class="btn review" :disabled="!!opening" @click="review(g)">
          {{ opening === g.date ? '…' : 'Revoir' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.setup {
  display: grid;
  gap: 12px;
  max-width: 560px;
  margin: 0 auto;
}
h2 {
  margin: 0 0 6px;
  font-size: 18px;
}
h3 {
  margin: 0 0 8px;
  font-size: 15px;
}
label {
  display: block;
  margin: 14px 0 6px;
  color: var(--muted);
  font-size: 13px;
}
label.check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--text);
  font-size: 13.5px;
}
label.check input {
  margin-top: 3px;
}
.ratings {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
label.rating {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding-left: 10px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel-2);
}
label.rating:focus-within {
  border-color: var(--accent);
}
.rating input {
  flex: 1;
  min-width: 0;
  padding: 10px 10px 10px 0;
  border: 0;
  background: transparent;
  color: var(--text);
  font:
    600 16px system-ui,
    sans-serif;
  text-align: right;
  outline: none;
}
.start {
  width: 100%;
  margin-top: 18px;
  padding: 13px;
  font-size: 16px;
}
.history-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 0.8fr 0.7fr auto;
  align-items: center;
  gap: 6px;
  padding: 5px 0;
  border-top: 1px solid var(--line);
}
.history-row .review {
  padding: 4px 10px;
  font-size: 13px;
}
</style>
