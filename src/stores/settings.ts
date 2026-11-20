import { defineStore } from 'pinia';
import { computed, reactive, ref, shallowRef, toRaw } from 'vue';
import {
  ClaudeAppProvider,
  createApiProvider,
  type ApiProviderId,
  type CoachProvider,
  type ProviderId,
} from '@/coach/providers';
import type { CoachError } from '@/coach/providers/types';
import type { GameDetails } from '@/game/details';
import type { Drill } from '@/game/drills';
import type { GameRecord, Settings } from '@/game/types';
import { useCapability, type SampleFunction } from '@/platform/claudeRuntime';
import { loadProviderConfigs, loadRememberKeys, saveProviderConfigs } from '@/storage/apiKeys';
import { createProfileStore, type ProfileStore } from '@/storage/profileStore';
import { DEFAULT_SETTINGS, ratingText, sanitizeSettings } from '@/storage/settings';

const API_ORDER: ApiProviderId[] = ['anthropic', 'openai', 'gemini'];

export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>({ ...DEFAULT_SETTINGS });
  const providers = reactive(loadProviderConfigs());
  const rememberKeys = ref(loadRememberKeys());
  const claudeSample = shallowRef<SampleFunction | null>(null);
  const ready = ref(false);
  /** Set after a permanent coach error (refused key, not granted): the coach stops being called. */
  const coachDisabled = ref('');
  const history = ref<GameRecord[]>([]);
  let profile: ProfileStore | null = null;

  async function init(): Promise<void> {
    const [store, sample] = await Promise.all([createProfileStore(), useCapability('sample')]);
    profile = store;
    claudeSample.value = sample;
    Object.assign(settings, sanitizeSettings(await store.loadSettings()));
    ready.value = true;
    await refreshHistory();
  }

  async function refreshHistory(): Promise<void> {
    if (profile) history.value = await profile.recentGames(8);
  }

  function saveSettings(): Promise<void> {
    return profile?.saveSettings({ ...toRaw(settings) }) ?? Promise.resolve();
  }

  function saveProviders(): void {
    saveProviderConfigs(structuredClone(toRaw(providers)), rememberKeys.value);
    coachDisabled.value = '';
  }

  async function addGame(game: GameRecord): Promise<void> {
    await profile?.addGame(game);
    await refreshHistory();
  }

  function saveDetails(details: GameDetails): Promise<void> {
    return profile?.saveDetails(details) ?? Promise.resolve();
  }

  function loadDetails(key: string): Promise<GameDetails | null> {
    return profile?.loadDetails(key) ?? Promise.resolve(null);
  }

  function loadDrills(): Promise<Drill[]> {
    return profile?.loadDrills() ?? Promise.resolve([]);
  }

  function saveDrills(drills: Drill[]): Promise<void> {
    return profile?.saveDrills(drills) ?? Promise.resolve();
  }

  const activeProviderId = computed<ProviderId | null>(() => {
    const choice = settings.provider;
    if (choice === 'none') return null;
    if (choice === 'claude-app') return claudeSample.value ? 'claude-app' : null;
    if (choice !== 'auto') return providers[choice].apiKey ? choice : null;
    if (claudeSample.value) return 'claude-app';
    return API_ORDER.find((id) => providers[id].apiKey) ?? null;
  });

  function coachProvider(): CoachProvider | null {
    if (coachDisabled.value) return null;
    const id = activeProviderId.value;
    if (!id) return null;
    if (id === 'claude-app') return claudeSample.value ? new ClaudeAppProvider(claudeSample.value) : null;
    return createApiProvider(id, { ...toRaw(providers[id]) });
  }

  function disableCoach(e: CoachError): void {
    coachDisabled.value = e.message;
  }

  const coachLabel = computed(() => {
    if (!ready.value) return 'Connexion au coach…';
    if (coachDisabled.value) return 'Coach IA en erreur : vérifie les réglages';
    const id = activeProviderId.value;
    if (!id) return 'Coach IA non configuré : indices du moteur seulement';
    if (id === 'claude-app') return 'Coach IA : ton compte Claude';
    return `Coach IA : ${providers[id].model}`;
  });

  const rating = computed(() => ratingText(settings));

  return {
    settings,
    providers,
    rememberKeys,
    ready,
    history,
    coachDisabled,
    activeProviderId,
    coachLabel,
    rating,
    insideClaude: computed(() => !!claudeSample.value),
    init,
    saveSettings,
    saveProviders,
    addGame,
    saveDetails,
    loadDetails,
    loadDrills,
    saveDrills,
    coachProvider,
    disableCoach,
  };
});
