import type { SampleError, SampleFunction } from '@/platform/claudeRuntime';
import { CoachError, type CoachErrorCode, type CoachProvider, type CompletionRequest } from './types';

const PERMANENT = [
  'not_granted',
  'sampling_disabled',
  'not_declared',
  'capability_disabled',
  'capability_removed',
];

function mapCode(code: string): CoachErrorCode {
  if (PERMANENT.includes(code)) return 'not_granted';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'cancelled') return 'cancelled';
  if (code === 'refused' || code === 'empty_completion') return 'refused';
  if (code === 'session_expired') return 'auth';
  return 'unknown';
}

/** Claude through the viewer's own claude.ai account, when the app runs as a claude.ai artifact. */
export class ClaudeAppProvider implements CoachProvider {
  readonly id = 'claude-app' as const;
  readonly label = 'Claude (compte claude.ai)';

  constructor(private readonly sample: SampleFunction) {}

  async complete({ prompt, tier, signal, onText }: CompletionRequest): Promise<string> {
    try {
      const res = await this.sample(prompt, {
        modelTier: tier,
        signal,
        onText: onText ? ({ text }) => onText(text) : undefined,
      });
      return res.text;
    } catch (e) {
      const err = e as SampleError;
      throw new CoachError(mapCode(err.code), err.message ?? 'Erreur du coach', err.text ?? '');
    }
  }
}
