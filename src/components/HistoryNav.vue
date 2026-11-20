<script setup lang="ts">
defineProps<{ atStart: boolean; atEnd: boolean }>();
const emit = defineEmits<{ navigate: [action: 'first' | 'prev' | 'next' | 'last'] }>();
</script>

<template>
  <div class="nav">
    <button class="btn" :disabled="atStart" aria-label="Début" @click="emit('navigate', 'first')">⏮</button>
    <button class="btn" :disabled="atStart" aria-label="Coup précédent" @click="emit('navigate', 'prev')">
      ◀
    </button>
    <button class="btn" :disabled="atEnd" aria-label="Coup suivant" @click="emit('navigate', 'next')">
      ▶
    </button>
    <button class="btn" :disabled="atEnd" aria-label="Position actuelle" @click="emit('navigate', 'last')">
      ⏭
    </button>
  </div>
</template>

<style scoped>
.nav {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}
.btn {
  padding: 7px 0;
  font-size: 15px;
}
</style>
