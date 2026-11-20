<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { frSan } from '@/chess/notation';
import type { MoveClass } from '@/chess/types';

export interface MoveMark {
  mark: string;
  cls: MoveClass;
  opponent: boolean;
}

const props = defineProps<{ moves: string[]; marks: Map<number, MoveMark>; current: number }>();
const emit = defineEmits<{ select: [ply: number] }>();

const el = ref<HTMLElement | null>(null);

watch(
  () => [props.moves.length, props.current],
  async () => {
    await nextTick();
    const box = el.value;
    const cur = box?.querySelector<HTMLElement>('.move.current');
    if (!box) return;
    box.scrollLeft = cur ? Math.max(0, cur.offsetLeft - box.clientWidth / 2) : box.scrollWidth;
  },
  { immediate: true },
);

const markClass = (m: MoveMark) => (m.opponent ? 'mark-opp' : `mark-${m.cls}`);
</script>

<template>
  <div ref="el" class="moves">
    <span v-if="!moves.length" class="muted">Les coups apparaîtront ici.</span>
    <template v-for="(san, i) in moves" :key="i">
      <span v-if="i % 2 === 0" class="number">{{ i / 2 + 1 }}.</span>
      <button class="move" :class="{ current: i === current }" @click="emit('select', i)">
        {{ frSan(san)
        }}<sup v-if="marks.get(i)" :class="markClass(marks.get(i)!)">{{ marks.get(i)!.mark }}</sup>
      </button>
    </template>
  </div>
</template>

<style scoped>
.moves {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  white-space: nowrap;
  padding: 8px 10px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
  font-size: 14px;
  scrollbar-width: thin;
}
.number {
  color: var(--muted);
  margin-left: 4px;
}
.move {
  padding: 1px 4px;
  border: 0;
  border-radius: 5px;
  background: none;
  cursor: pointer;
}
.move.current {
  background: var(--panel-2);
  outline: 1px solid var(--line);
}
sup {
  margin-left: 1px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  vertical-align: top;
}
</style>
