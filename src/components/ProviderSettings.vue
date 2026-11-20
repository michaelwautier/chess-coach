<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { API_PROVIDERS, createApiProvider, type ApiProviderId } from '@/coach/providers';
import { coachErrorMessage } from '@/coach/runCoach';
import type { ProviderChoice } from '@/game/types';
import { useSettingsStore } from '@/stores/settings';

const store = useSettingsStore();

const choices = computed<{ value: ProviderChoice; label: string }[]>(() => [
  { value: 'auto', label: 'Automatique' },
  ...(store.insideClaude ? [{ value: 'claude-app' as const, label: 'Mon compte Claude' }] : []),
  { value: 'anthropic', label: 'Claude (clé API)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'none', label: 'Aucun' },
]);

const API_IDS: ApiProviderId[] = ['anthropic', 'openai', 'gemini'];
const isApi = (v: string): v is ApiProviderId => (API_IDS as string[]).includes(v);

const editing = ref<ApiProviderId>(isApi(store.settings.provider) ? store.settings.provider : 'anthropic');
watch(
  () => store.settings.provider,
  (p) => {
    if (isApi(p)) editing.value = p;
  },
);

const config = computed(() => store.providers[editing.value]);
const info = computed(() => API_PROVIDERS[editing.value]);
const showKey = ref(false);
const showAdvanced = ref(false);
const models = ref<string[]>([]);
const status = ref('');
const busy = ref(false);

function choose(value: ProviderChoice): void {
  store.settings.provider = value;
  void store.saveSettings();
}

function save(): void {
  store.saveProviders();
}

async function testKey(): Promise<void> {
  save();
  busy.value = true;
  status.value = 'Test en cours…';
  try {
    const provider = createApiProvider(editing.value, { ...config.value });
    await provider.complete({ prompt: 'Réponds seulement : OK', tier: 'quick' });
    status.value = '✓ La clé fonctionne.';
  } catch (e) {
    status.value = coachErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

async function loadModels(): Promise<void> {
  busy.value = true;
  status.value = 'Chargement des modèles…';
  try {
    models.value = await createApiProvider(editing.value, { ...config.value }).listModels();
    status.value = `${models.value.length} modèles disponibles : choisis-en un dans les champs ci-dessous.`;
  } catch (e) {
    status.value = coachErrorMessage(e);
  } finally {
    busy.value = false;
  }
}

function resetModels(): void {
  config.value.model = info.value.model;
  config.value.fastModel = info.value.fastModel;
  config.value.baseUrl = info.value.baseUrl;
  save();
}

watch(editing, () => {
  models.value = [];
  status.value = '';
});
</script>

<template>
  <div class="provider">
    <h3>Coach IA</h3>
    <p class="muted small">{{ store.coachLabel }}</p>
    <div class="seg">
      <button
        v-for="c in choices"
        :key="c.value"
        type="button"
        :class="{ on: store.settings.provider === c.value }"
        @click="choose(c.value)"
      >
        {{ c.label }}
      </button>
    </div>
    <p v-if="store.settings.provider === 'auto'" class="muted small">
      Automatique : ton compte Claude si l'app est ouverte dans Claude, sinon la première clé API renseignée.
    </p>

    <template v-if="store.settings.provider !== 'none' && store.settings.provider !== 'claude-app'">
      <div class="tabs">
        <span class="muted small">Clé à configurer :</span>
        <div class="seg">
          <button
            v-for="id in API_IDS"
            :key="id"
            type="button"
            :class="{ on: editing === id }"
            @click="editing = id"
          >
            {{ API_PROVIDERS[id].label }}
          </button>
        </div>
      </div>

      <label :for="`key-${editing}`">Clé API {{ info.label }}</label>
      <div class="row">
        <input
          :id="`key-${editing}`"
          v-model.trim="config.apiKey"
          :type="showKey ? 'text' : 'password'"
          autocomplete="off"
          spellcheck="false"
          placeholder="Colle ta clé ici"
          @change="save"
        />
        <button type="button" class="btn" @click="showKey = !showKey">
          {{ showKey ? 'Masquer' : 'Afficher' }}
        </button>
      </div>
      <p class="muted small">{{ info.keyHelp }}</p>
      <p v-if="info.note" class="warn-text small">{{ info.note }}</p>

      <div class="models">
        <div>
          <label :for="`model-${editing}`">Modèle (explications approfondies)</label>
          <input
            :id="`model-${editing}`"
            v-model.trim="config.model"
            type="text"
            list="model-list"
            @change="save"
          />
        </div>
        <div>
          <label :for="`fast-${editing}`">Modèle rapide</label>
          <input
            :id="`fast-${editing}`"
            v-model.trim="config.fastModel"
            type="text"
            list="model-list"
            @change="save"
          />
        </div>
      </div>
      <datalist id="model-list">
        <option v-for="m in models" :key="m" :value="m" />
      </datalist>

      <button type="button" class="link small" @click="showAdvanced = !showAdvanced">
        {{ showAdvanced ? 'Masquer' : 'Afficher' }} les options avancées
      </button>
      <template v-if="showAdvanced">
        <label :for="`url-${editing}`">URL de l'API (relais ou service compatible)</label>
        <input :id="`url-${editing}`" v-model.trim="config.baseUrl" type="url" @change="save" />
        <button type="button" class="btn small-btn" @click="resetModels">Valeurs par défaut</button>
      </template>

      <div class="btn-row">
        <button type="button" class="btn" :disabled="!config.apiKey || busy" @click="testKey">
          Tester la clé
        </button>
        <button type="button" class="btn" :disabled="!config.apiKey || busy" @click="loadModels">
          Charger la liste des modèles
        </button>
      </div>
      <p v-if="status" class="small status">{{ status }}</p>

      <label class="check">
        <input v-model="store.rememberKeys" type="checkbox" @change="save" />
        Se souvenir de mes clés sur cet appareil
      </label>
      <p class="muted small">
        Tes clés restent dans ce navigateur et partent directement chez le fournisseur choisi. Sans cette
        case, elles sont oubliées à la fermeture de l'onglet. Chaque explication est facturée sur ton compte
        du fournisseur.
      </p>
    </template>
  </div>
</template>

<style scoped>
h3 {
  margin: 0 0 2px;
  font-size: 16px;
}
label {
  display: block;
  margin: 12px 0 6px;
  color: var(--muted);
  font-size: 13px;
}
label.check {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--text);
}
.tabs {
  margin-top: 12px;
  display: grid;
  gap: 6px;
}
.row {
  display: flex;
  gap: 8px;
}
.row input {
  flex: 1;
  min-width: 0;
}
.models {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.link {
  margin-top: 8px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--advice);
  cursor: pointer;
}
.small-btn {
  margin-top: 8px;
}
.status {
  margin: 8px 0 0;
}
</style>
