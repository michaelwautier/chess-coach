<script setup lang="ts">
import AppearanceSettings from './AppearanceSettings.vue';
import ProviderSettings from './ProviderSettings.vue';
import SoundSettings from './SoundSettings.vue';

const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <section class="settings">
    <h2>Réglages</h2>
    <div class="card"><AppearanceSettings /></div>
    <div class="card"><SoundSettings /></div>
    <div class="card"><ProviderSettings /></div>
    <button class="btn primary done" @click="emit('close')">Retour à l'accueil</button>
  </section>
</template>

<style scoped>
.settings {
  display: grid;
  gap: 12px;
  max-width: 560px;
  margin: 0 auto;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.done {
  padding: 12px;
}
</style>
