<script setup lang="ts">
import { computed } from 'vue';
import { SOUND_SETS, playSound, type SoundName, type SoundSetId } from '@/audio/sounds';
import { useSettingsStore } from '@/stores/settings';

const s = useSettingsStore().settings;

const SAMPLES: { name: SoundName; label: string }[] = [
  { name: 'move', label: 'Coup' },
  { name: 'capture', label: 'Prise' },
  { name: 'castle', label: 'Roque' },
  { name: 'check', label: 'Échec' },
  { name: 'promote', label: 'Promotion' },
  { name: 'coach', label: 'Pause du coach' },
  { name: 'win', label: 'Victoire' },
  { name: 'loss', label: 'Défaite' },
  { name: 'draw', label: 'Nulle' },
];

const chosen = computed(() => SOUND_SETS.find((x) => x.id === s.soundSet) ?? SOUND_SETS[0]);
const silent = computed(() => s.soundSet === 'off');

/** Choosing a set plays a capture with it, so the difference is heard at once. */
function chooseSet(id: SoundSetId): void {
  s.soundSet = id;
  playSound('capture', 0, id);
}

function preview(name: SoundName): void {
  playSound(name, 0, s.soundSet);
}
</script>

<template>
  <div class="sounds">
    <h3>Sons</h3>
    <p class="muted small intro">
      À chaque coup, prise, roque, échec et promotion, quand le coach arrête la pendule et en fin de partie.
    </p>

    <label>Style</label>
    <div class="sets">
      <button
        v-for="x in SOUND_SETS"
        :key="x.id"
        type="button"
        class="set"
        :class="{ on: s.soundSet === x.id }"
        :title="x.description"
        @click="chooseSet(x.id)"
      >
        {{ x.label }}
      </button>
    </div>
    <p class="muted small">{{ chosen.description }}</p>

    <template v-if="!silent">
      <label for="sound-volume">Volume : {{ s.soundVolume }} %</label>
      <input id="sound-volume" v-model.number="s.soundVolume" type="range" min="0" max="100" step="5" />

      <label>Écouter</label>
      <div class="samples">
        <button
          v-for="x in SAMPLES"
          :key="x.name"
          type="button"
          class="btn"
          :disabled="!s.soundVolume"
          @click="preview(x.name)"
        >
          {{ x.label }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.intro {
  margin: 0;
}
label {
  display: block;
  margin: 14px 0 6px;
  color: var(--muted);
  font-size: 13px;
}
.sets,
.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.set {
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--panel-2);
  cursor: pointer;
  font-size: 13px;
}
.set.on {
  border-color: var(--accent);
  outline: 1px solid var(--accent);
}
.samples .btn {
  padding: 6px 10px;
  font-size: 13px;
}
</style>
