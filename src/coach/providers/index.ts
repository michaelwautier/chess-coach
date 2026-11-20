import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { OpenAiProvider } from './openai';
import type { ApiProviderConfig, ApiProviderId, CoachProvider } from './types';

export * from './types';
export { ClaudeAppProvider } from './claudeApp';

type ApiProvider = CoachProvider & { listModels(): Promise<string[]> };

export function createApiProvider(id: ApiProviderId, config: ApiProviderConfig): ApiProvider {
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAiProvider(config);
    case 'gemini':
      return new GeminiProvider(config);
  }
}
