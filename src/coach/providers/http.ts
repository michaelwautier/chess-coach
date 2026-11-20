import { CoachError } from './types';

/** Turns a failed HTTP response into a CoachError with a readable message. */
export async function errorFromResponse(response: Response): Promise<CoachError> {
  let detail: string;
  try {
    const body = (await response.json()) as { error?: { message?: string } | string; message?: string };
    detail = typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '');
  } catch {
    detail = response.statusText;
  }
  const message = `HTTP ${response.status}${detail ? ` : ${detail}` : ''}`;
  if (response.status === 401 || response.status === 403) return new CoachError('auth', message);
  if (response.status === 429) return new CoachError('rate_limited', message);
  return new CoachError('unknown', message);
}

/** fetch() that maps network and abort failures to CoachError. */
export async function request(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new CoachError('cancelled', 'Requête annulée');
    throw new CoachError(
      'network',
      'Requête bloquée ou réseau indisponible (CORS, connexion ou URL invalide).',
    );
  }
  if (!response.ok) throw await errorFromResponse(response);
  return response;
}

/** Reads a Server-Sent Events stream and yields each event's data payload. */
export async function* readSse(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<{ event: string; data: string }> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = 'message';
  let data: string[] = [];
  try {
    for (;;) {
      if (signal?.aborted) throw new CoachError('cancelled', 'Requête annulée');
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line === '') {
          if (data.length) yield { event, data: data.join('\n') };
          event = 'message';
          data = [];
        } else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
    }
    if (data.length) yield { event, data: data.join('\n') };
  } finally {
    reader.releaseLock();
  }
}
