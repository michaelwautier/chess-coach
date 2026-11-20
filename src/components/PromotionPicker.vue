<script setup lang="ts">
import type { Color, PieceType } from '@/chess/types';

defineProps<{ color: Color }>();
const emit = defineEmits<{ choose: [piece: PieceType] }>();

const PIECES: { type: PieceType; name: string; label: string }[] = [
  { type: 'q', name: 'queen', label: 'Dame' },
  { type: 'r', name: 'rook', label: 'Tour' },
  { type: 'b', name: 'bishop', label: 'Fou' },
  { type: 'n', name: 'knight', label: 'Cavalier' },
];
</script>

<template>
  <div class="promotion">
    <!-- .cg-wrap reuses chessground's piece images -->
    <div class="cg-wrap choices">
      <button v-for="p in PIECES" :key="p.type" :aria-label="p.label" @click="emit('choose', p.type)">
        <piece :class="[p.name, color === 'w' ? 'white' : 'black']" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.promotion {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
}
.choices {
  display: flex;
  gap: 6px;
  width: 92%;
}
button {
  flex: 1;
  aspect-ratio: 1;
  background: #f0d9b5;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  padding: 6%;
}
piece {
  position: static;
  display: block;
  width: 100%;
  height: 100%;
}
</style>
