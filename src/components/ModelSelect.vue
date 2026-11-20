<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ id: string; options: string[] }>();
const model = defineModel<string>({ required: true });
const emit = defineEmits<{ change: [] }>();

const CUSTOM = '__custom__';
const custom = ref(false);

// The current model always stays selectable, even when the provider no longer lists it.
const choices = computed(() =>
  !model.value || props.options.includes(model.value) ? props.options : [model.value, ...props.options],
);

function onSelect(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  if (value === CUSTOM) {
    custom.value = true;
    return;
  }
  model.value = value;
  emit('change');
}
</script>

<template>
  <div v-if="custom" class="custom">
    <input
      :id="id"
      v-model.trim="model"
      type="text"
      spellcheck="false"
      autocomplete="off"
      placeholder="Identifiant du modèle"
      @change="emit('change')"
    />
    <button type="button" class="btn" @click="custom = false">Liste</button>
  </div>
  <select v-else :id="id" :value="model" @change="onSelect">
    <option v-for="m in choices" :key="m" :value="m">{{ m }}</option>
    <option :value="CUSTOM">Autre modèle…</option>
  </select>
</template>

<style scoped>
.custom {
  display: flex;
  gap: 8px;
}
.custom input {
  flex: 1;
  min-width: 0;
}
</style>
