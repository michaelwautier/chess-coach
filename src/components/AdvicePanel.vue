<script setup lang="ts">
import { computed } from 'vue';
import { possessive } from '@/chess/constants';
import { formatScore } from '@/chess/evaluation';
import { formatLine, pieceTypeAt, uciLineToSan } from '@/chess/notation';
import { lineScore } from '@/engine/uci';
import type { AdviceState } from '@/stores/game';
import CoachSection from './CoachSection.vue';
import CoachStatus from './CoachStatus.vue';

const props = defineProps<{ advice: AdviceState }>();
const emit = defineEmits<{ resume: []; engineHint: []; best: []; recoach: [] }>();

const best = computed(() => {
  const line = props.advice.lines?.[0];
  if (!line) return '';
  return `${formatLine(props.advice.fen, uciLineToSan(props.advice.fen, line.pv, 6))} (${formatScore(lineScore(line))})`;
});
const engineHint = computed(() => {
  const line = props.advice.lines?.[0];
  if (!line) return '';
  const from = line.pv[0].slice(0, 2);
  const type = pieceTypeAt(props.advice.fen, from);
  return type ? `C'est ${possessive(type, 'ton')} ${from} qu'il faut jouer.` : `Le coup part de ${from}.`;
});
</script>

<template>
  <div class="card advice">
    <div class="head">
      <span class="badge advice">Conseil</span>
      <span class="muted">pendule en pause</span>
    </div>
    <CoachSection title="Où regarder" :text="advice.answer.sections['CONSEIL']" />
    <CoachSection title="Plan" :text="advice.answer.sections['PLAN']" />
    <p v-if="!advice.lines" class="thinking"><span class="dots" /> Analyse de la position…</p>
    <CoachStatus v-else :answer="advice.answer" @retry="emit('recoach')" />
    <CoachSection v-if="advice.engineHintShown" title="Indice du moteur" :text="engineHint" />
    <CoachSection v-if="advice.bestShown" title="Meilleur coup du moteur" :text="best" variant="best" />
    <div class="btn-row">
      <button class="btn primary" @click="emit('resume')">▶ Reprendre</button>
      <button v-if="advice.lines && !advice.engineHintShown" class="btn" @click="emit('engineHint')">
        Indice du moteur
      </button>
      <button v-if="advice.lines && !advice.bestShown" class="btn" @click="emit('best')">
        Montrer le meilleur coup
      </button>
    </div>
    <p class="muted small">Tu peux aussi jouer directement ton coup sur l'échiquier.</p>
  </div>
</template>

<style scoped>
.advice {
  border-left: 4px solid var(--advice);
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
</style>
