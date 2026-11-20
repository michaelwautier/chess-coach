export type ProviderId = 'claude-app' | 'anthropic' | 'openai' | 'gemini';
export type ApiProviderId = Exclude<ProviderId, 'claude-app'>;
export type ModelTier = 'default' | 'quick';

export interface CompletionRequest {
  prompt: string;
  tier: ModelTier;
  signal?: AbortSignal;
  /** Called with the whole answer written so far. */
  onText?: (text: string) => void;
}

export interface CoachProvider {
  readonly id: ProviderId;
  readonly label: string;
  complete(request: CompletionRequest): Promise<string>;
}

export interface ApiProviderConfig {
  apiKey: string;
  model: string;
  fastModel: string;
  baseUrl: string;
}

export type CoachErrorCode =
  | 'not_configured'
  | 'not_granted'
  | 'auth'
  | 'rate_limited'
  | 'network'
  | 'cancelled'
  | 'refused'
  | 'unknown';

export class CoachError extends Error {
  constructor(
    readonly code: CoachErrorCode,
    message: string,
    /** Text received before the failure, if any. */
    readonly partial = '',
  ) {
    super(message);
    this.name = 'CoachError';
  }

  /** Errors after which the coach should stop being called for this session. */
  get permanent(): boolean {
    return this.code === 'not_granted' || this.code === 'not_configured' || this.code === 'auth';
  }
}

export interface ProviderInfo {
  label: string;
  baseUrl: string;
  model: string;
  fastModel: string;
  /** Where to create an API key, shown as help text. */
  keyHelp: string;
  /** Known caveats about calling the API from a browser. */
  note?: string;
}

export const API_PROVIDERS: Record<ApiProviderId, ProviderInfo> = {
  anthropic: {
    label: 'Claude (Anthropic)',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    fastModel: 'claude-haiku-5-5',
    keyHelp:
      'Clé à créer dans la console Anthropic (facturation à l’usage, distincte d’un abonnement Claude).',
  },
  openai: {
    label: 'OpenAI (GPT)',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-6.2-sol',
    fastModel: 'gpt-6-luna',
    keyHelp:
      'Clé à créer sur la plateforme OpenAI (facturation à l’usage, distincte d’un abonnement ChatGPT).',
    note: 'OpenAI ne garantit pas les appels directs depuis un navigateur : si la requête est bloquée (CORS), indique l’URL d’un relais compatible.',
  },
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.7-flash',
    fastModel: 'gemini-3.5-flash-lite',
    keyHelp: 'Clé à créer dans Google AI Studio.',
  },
};
