<script setup lang="ts">
import { computed } from 'vue';
import type { Color, PieceType } from '@/chess/types';
import { formatClock } from '@/game/clock';

const props = defineProps<{
  name: string;
  captured: PieceType[];
  advantage: number;
  timeMs: number;
  running: boolean;
  paused: boolean;
  color: Color;
}>();

const GLYPH: Record<PieceType, string> = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };
const material = computed(
  () => props.captured.map((t) => GLYPH[t]).join('') + (props.advantage > 0 ? ` +${props.advantage}` : ''),
);
</script>

<template>
  <div class="player">
    <span class="name">{{ name }}</span>
    <span class="material">{{ material }}</span>
    <span class="clock" :class="{ running, low: timeMs < 20000, paused }">{{ formatClock(timeMs) }}</span>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
}
.name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.material {
  flex: 1;
  color: var(--muted);
  font-size: 14px;
  letter-spacing: -1px;
  white-space: nowrap;
  overflow: hidden;
}
.clock {
  min-width: 92px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--muted);
  font:
    600 22px/1 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  text-align: right;
}
.clock.running {
  background: var(--text);
  color: var(--bg);
}
.clock.low.running {
  background: var(--blunder);
  color: #fff;
}
.clock.paused {
  outline: 2px dashed var(--advice);
  outline-offset: 2px;
}
</style>
