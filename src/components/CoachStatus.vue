<script setup lang="ts">
import type { CoachAnswer } from '@/game/types';

defineProps<{ answer: CoachAnswer }>();
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <p v-if="answer.status === 'done' && !Object.keys(answer.sections).length && answer.raw" class="raw">
    {{ answer.raw }}
  </p>
  <p v-else-if="answer.status === 'loading'" class="thinking">
    <span class="dots" /> Le coach réfléchit… (la pendule reste en pause)
  </p>
  <template v-else-if="answer.status === 'error' && answer.error">
    <p class="warn-text">{{ answer.error }}</p>
    <div class="btn-row"><button class="btn" @click="emit('retry')">Redemander au coach</button></div>
  </template>
  <p v-else-if="answer.status === 'unavailable'" class="muted small">
    Coach IA non configuré : indices du moteur uniquement. Ajoute une clé API dans les réglages pour les
    explications.
  </p>
</template>

<style scoped>
.raw {
  margin: 10px 0 0;
  white-space: pre-line;
}
</style>
