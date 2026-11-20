<script setup lang="ts">
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import type { Square } from 'chess.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BoardView } from '@/stores/game';

const props = defineProps<{ view: BoardView; shapes: DrawShape[] }>();
const emit = defineEmits<{ move: [orig: Square, dest: Square] }>();

const el = ref<HTMLElement | null>(null);
let api: Api | null = null;

function apply(view: BoardView): void {
  api?.set({
    fen: view.fen,
    orientation: view.orientation,
    turnColor: view.turnColor,
    lastMove: view.lastMove,
    check: view.check,
    movable: { color: view.orientation, dests: view.dests as Map<Key, Key[]> },
  });
}

onMounted(() => {
  api = Chessground(el.value!, {
    coordinates: true,
    animation: { enabled: true, duration: 180 },
    highlight: { lastMove: true, check: true },
    movable: {
      free: false,
      showDests: true,
      events: { after: (orig, dest) => emit('move', orig as Square, dest as Square) },
    },
    premovable: { enabled: false },
    draggable: { enabled: true, showGhost: true },
    drawable: { enabled: true, visible: true },
  });
  apply(props.view);
  api.setAutoShapes(props.shapes);
});

onBeforeUnmount(() => api?.destroy());

watch(() => props.view, apply);
watch(
  () => props.shapes,
  (shapes) => api?.setAutoShapes(shapes),
);
</script>

<template>
  <div ref="el" class="board" />
</template>

<style scoped>
.board {
  width: 100%;
  height: 100%;
}
</style>
