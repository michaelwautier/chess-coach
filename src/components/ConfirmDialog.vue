<script setup lang="ts">
import { useDialogStore } from '@/stores/dialog';

const dialog = useDialogStore();
</script>

<template>
  <div v-if="dialog.current" class="backdrop">
    <div class="dialog" role="dialog" aria-modal="true">
      <p>{{ dialog.current.message }}</p>
      <div class="buttons">
        <button
          v-for="b in dialog.current.buttons"
          :key="b.label"
          class="btn"
          :class="{ primary: b.primary }"
          @click="dialog.answer(b.value)"
        >
          {{ b.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.6);
}
.dialog {
  width: 100%;
  max-width: 360px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
}
p {
  margin: 0 0 14px;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
