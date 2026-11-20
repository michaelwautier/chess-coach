import { readSse, request } from './http';
import {
  API_PROVIDERS,
  CoachError,
  type ApiProviderConfig,
  type CoachProvider,
  type CompletionRequest,
} from './types';

/** Google Gemini through the native REST API (streamGenerateContent). */
export class GeminiProvider implements CoachProvider {
  readonly id = 'gemini' as const;
  readonly label = API_PROVIDERS.gemini.label;

  constructor(private readonly config: ApiProviderConfig) {}

  private get base(): string {
    return `${this.config.baseUrl.replace(/\/$/, '')}/v1beta`;
  }

  private headers(): HeadersInit {
    return { 'content-type': 'application/json', 'x-goog-api-key': this.config.apiKey };
  }

  async complete({ prompt, tier, signal, onText }: CompletionRequest): Promise<string> {
    const model = tier === 'quick' ? this.config.fastModel : this.config.model;
    const response = await request(
      `${this.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: this.headers(),
        signal,
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      },
    );
    let text = '';
    for await (const { data } of readSse(response, signal)) {
      const chunk = JSON.parse(data) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
        error?: { message: string };
      };
      if (chunk.error) throw new CoachError('unknown', chunk.error.message, text);
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      const delta = parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('');
      if (delta) {
        text += delta;
        onText?.(text);
      }
    }
    if (!text.trim()) throw new CoachError('refused', 'Réponse vide');
    return text;
  }

  async listModels(): Promise<string[]> {
    const response = await request(`${this.base}/models?pageSize=200`, { headers: this.headers() });
    const body = (await response.json()) as {
      models: { name: string; supportedGenerationMethods?: string[] }[];
    };
    return body.models
      .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, ''));
  }
}
