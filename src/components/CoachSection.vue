<script setup lang="ts">
defineProps<{ title: string; text?: string; variant?: 'hint' | 'best' | 'refutation' | 'lesson' }>();
</script>

<template>
  <div v-if="text" class="section" :class="variant">
    <h4>{{ title }}</h4>
    <p>{{ text }}</p>
  </div>
</template>

<style scoped>
.section {
  margin-top: 10px;
}
h4 {
  margin: 0 0 3px;
  font-size: 12px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--muted);
}
p {
  margin: 0;
  white-space: pre-line;
}
.hint p {
  font-size: 15.5px;
}
.best p {
  color: var(--good);
  font-weight: 500;
}
.refutation p {
  color: #f0a5a0;
}
.lesson p {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-2);
}
</style>
