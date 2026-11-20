import { readSse, request } from './http';
import {
  API_PROVIDERS,
  CoachError,
  type ApiProviderConfig,
  type CoachProvider,
  type CompletionRequest,
} from './types';

/** Claude through the Anthropic Messages API, called directly from the browser with the user's key. */
export class AnthropicProvider implements CoachProvider {
  readonly id = 'anthropic' as const;
  readonly label = API_PROVIDERS.anthropic.label;

  constructor(private readonly config: ApiProviderConfig) {}

  private headers(): HeadersInit {
    return {
      'content-type': 'application/json',
      'x-api-key': this.config.apiKey,
      'anthropic-version': '2023-06-01',
      // Required by Anthropic for CORS requests; the key belongs to the user of this browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    };
  }

  async complete({ prompt, tier, signal, onText }: CompletionRequest): Promise<string> {
    const response = await request(`${this.config.baseUrl.replace(/\/$/, '')}/v1/messages`, {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify({
        model: tier === 'quick' ? this.config.fastModel : this.config.model,
        max_tokens: 2000,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    let text = '';
    for await (const { data } of readSse(response, signal)) {
      const event = JSON.parse(data) as {
        type: string;
        delta?: { type: string; text?: string };
        error?: { message: string };
      };
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        text += event.delta.text ?? '';
        onText?.(text);
      } else if (event.type === 'error') {
        throw new CoachError('unknown', event.error?.message ?? 'Erreur Anthropic', text);
      }
    }
    if (!text.trim()) throw new CoachError('refused', 'Réponse vide');
    return text;
  }

  async listModels(): Promise<string[]> {
    const response = await request(`${this.config.baseUrl.replace(/\/$/, '')}/v1/models?limit=100`, {
      headers: this.headers(),
    });
    const body = (await response.json()) as { data: { id: string }[] };
    return body.data.map((m) => m.id);
  }
}
