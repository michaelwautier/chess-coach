import type { CoachAnswer } from '@/game/types';
import { parseSections } from './sections';
import { CoachError, type CoachProvider, type ModelTier } from './providers/types';

export function coachErrorMessage(e: unknown): string {
  if (!(e instanceof CoachError)) return 'Le coach n’a pas pu répondre.';
  switch (e.code) {
    case 'not_granted':
      return 'Le coach IA n’est pas autorisé ici. Les données du moteur restent affichées.';
    case 'not_configured':
      return 'Aucun coach IA configuré : ajoute une clé API dans les réglages.';
    case 'auth':
      return `Clé API refusée par le fournisseur (${e.message}). Vérifie-la dans les réglages.`;
    case 'rate_limited':
      return 'Trop de demandes au coach pour le moment. Réessaie dans un instant.';
    case 'network':
      return e.message;
    case 'refused':
      return 'Le coach n’a pas donné de réponse exploitable.';
    case 'cancelled':
      return '';
    default:
      return `Le coach n’a pas pu répondre (${e.message}).`;
  }
}

/**
 * Asks the coach and streams the answer, parsed into labelled sections, into `answer`
 * (a reactive object owned by the caller).
 */
export async function runCoach(
  provider: CoachProvider | null,
  prompt: string,
  labels: readonly string[],
  tier: ModelTier,
  answer: CoachAnswer,
  onPermanentError?: (e: CoachError) => void,
): Promise<void> {
  if (!provider) {
    answer.status = 'unavailable';
    return;
  }
  answer.status = 'loading';
  answer.error = '';
  try {
    const text = await provider.complete({
      prompt,
      tier,
      onText: (t) => {
        answer.raw = t;
        answer.sections = parseSections(t, labels);
        if (Object.keys(answer.sections).length) answer.status = 'streaming';
      },
    });
    answer.raw = text;
    answer.sections = parseSections(text, labels);
    answer.status = 'done';
  } catch (e) {
    if (e instanceof CoachError && e.partial) {
      answer.raw = e.partial;
      answer.sections = parseSections(e.partial, labels);
    }
    answer.status = 'error';
    answer.error = coachErrorMessage(e);
    if (e instanceof CoachError && e.permanent) onPermanentError?.(e);
  }
}
