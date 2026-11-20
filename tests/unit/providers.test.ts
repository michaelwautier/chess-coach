import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiProvider, CoachError } from '@/coach/providers';
import { API_PROVIDERS, type ApiProviderId } from '@/coach/providers/types';

function sseResponse(events: string[]): Response {
  const body = events.map((e) => `${e}\n\n`).join('');
  return new Response(new Blob([body]).stream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const config = (id: ApiProviderId) => ({ apiKey: 'test-key', ...API_PROVIDERS[id] });

afterEach(() => vi.unstubAllGlobals());

describe('API providers', () => {
  it('streams an Anthropic answer with the browser-access header', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"INDICE: "}}',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"regarde e5"}}',
          'event: message_stop\ndata: {"type":"message_stop"}',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const seen: string[] = [];
    const text = await createApiProvider('anthropic', config('anthropic')).complete({
      prompt: 'p',
      tier: 'quick',
      onText: (t) => seen.push(t),
    });
    expect(text).toBe('INDICE: regarde e5');
    expect(seen).toEqual(['INDICE: ', 'INDICE: regarde e5']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(JSON.parse(init.body).model).toBe(API_PROVIDERS.anthropic.fastModel);
  });

  it('streams an OpenAI-compatible answer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"choices":[{"delta":{"content":"OK"}}]}',
          'data: {"choices":[{"delta":{}}]}',
          'data: [DONE]',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const text = await createApiProvider('openai', config('openai')).complete({
      prompt: 'p',
      tier: 'default',
    });
    expect(text).toBe('OK');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer test-key');
  });

  it('streams a Gemini answer and skips thought parts', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        sseResponse([
          'data: {"candidates":[{"content":{"parts":[{"text":"hmm","thought":true}]}}]}',
          'data: {"candidates":[{"content":{"parts":[{"text":"Bonjour"}]}}]}',
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);
    const text = await createApiProvider('gemini', config('gemini')).complete({
      prompt: 'p',
      tier: 'default',
    });
    expect(text).toBe('Bonjour');
    expect(fetchMock.mock.calls[0][0]).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${API_PROVIDERS.gemini.model}:streamGenerateContent?alt=sse`,
    );
    expect(fetchMock.mock.calls[0][1].headers['x-goog-api-key']).toBe('test-key');
  });

  it('maps HTTP and network failures to coach errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"error":{"message":"invalid x-api-key"}}', { status: 401 })),
    );
    await expect(
      createApiProvider('anthropic', config('anthropic')).complete({ prompt: 'p', tier: 'quick' }),
    ).rejects.toMatchObject({
      code: 'auth',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await createApiProvider('openai', config('openai'))
      .complete({ prompt: 'p', tier: 'quick' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CoachError);
    expect((err as CoachError).code).toBe('network');
  });
});
