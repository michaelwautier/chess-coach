import { readSse, request } from './http';
import {
  API_PROVIDERS,
  CoachError,
  type ApiProviderConfig,
  type CoachProvider,
  type CompletionRequest,
} from './types';

/**
 * OpenAI Chat Completions. `baseUrl` can point to any OpenAI-compatible endpoint
 * (a relay, OpenRouter, a local server…).
 */
export class OpenAiProvider implements CoachProvider {
  readonly id = 'openai' as const;
  readonly label = API_PROVIDERS.openai.label;

  constructor(private readonly config: ApiProviderConfig) {}

  private get base(): string {
    return this.config.baseUrl.replace(/\/$/, '');
  }

  private headers(): HeadersInit {
    return { 'content-type': 'application/json', authorization: `Bearer ${this.config.apiKey}` };
  }

  async complete({ prompt, tier, signal, onText }: CompletionRequest): Promise<string> {
    const response = await request(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal,
      body: JSON.stringify({
        model: tier === 'quick' ? this.config.fastModel : this.config.model,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    let text = '';
    for await (const { data } of readSse(response, signal)) {
      if (data === '[DONE]') break;
      const chunk = JSON.parse(data) as {
        choices?: { delta?: { content?: string } }[];
        error?: { message: string };
      };
      if (chunk.error) throw new CoachError('unknown', chunk.error.message, text);
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onText?.(text);
      }
    }
    if (!text.trim()) throw new CoachError('refused', 'Réponse vide');
    return text;
  }

  async listModels(): Promise<string[]> {
    const response = await request(`${this.base}/models`, { headers: this.headers() });
    const body = (await response.json()) as { data: { id: string }[] };
    return body.data.map((m) => m.id).sort();
  }
}
