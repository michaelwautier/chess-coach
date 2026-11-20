import { API_PROVIDERS, type ApiProviderConfig, type ApiProviderId } from '@/coach/providers/types';
import { local, readJson, removeKey, session, writeJson } from './browserStorage';

/**
 * API keys and model choices per provider. They stay in this browser: in localStorage when the user
 * asks to remember them, otherwise in sessionStorage (forgotten when the tab closes). They are never
 * sent anywhere except to the provider's own API.
 */
export type ProviderConfigs = Record<ApiProviderId, ApiProviderConfig>;

const KEY = 'chess-coach.providers';
const REMEMBER_KEY = 'chess-coach.remember-keys';

export const defaultProviderConfigs = (): ProviderConfigs => ({
  anthropic: { apiKey: '', ...pick('anthropic') },
  openai: { apiKey: '', ...pick('openai') },
  gemini: { apiKey: '', ...pick('gemini') },
});

function pick(id: ApiProviderId) {
  const { baseUrl, model, fastModel } = API_PROVIDERS[id];
  return { baseUrl, model, fastModel };
}

export function loadRememberKeys(): boolean {
  return readJson<boolean>(local(), REMEMBER_KEY) ?? false;
}

export function loadProviderConfigs(): ProviderConfigs {
  const stored = readJson<Partial<ProviderConfigs>>(loadRememberKeys() ? local() : session(), KEY) ?? {};
  const defaults = defaultProviderConfigs();
  for (const id of Object.keys(defaults) as ApiProviderId[]) {
    const s = stored[id];
    if (!s) continue;
    defaults[id] = {
      apiKey: typeof s.apiKey === 'string' ? s.apiKey.trim() : '',
      baseUrl: s.baseUrl || defaults[id].baseUrl,
      model: s.model || defaults[id].model,
      fastModel: s.fastModel || defaults[id].fastModel,
    };
  }
  return defaults;
}

export function saveProviderConfigs(configs: ProviderConfigs, remember: boolean): void {
  writeJson(local(), REMEMBER_KEY, remember);
  if (remember) {
    writeJson(local(), KEY, configs);
    removeKey(session(), KEY);
  } else {
    writeJson(session(), KEY, configs);
    removeKey(local(), KEY);
  }
}
