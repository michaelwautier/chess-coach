import { CLASS_INFO, colorName } from '@/chess/constants';
import { formatScore } from '@/chess/evaluation';
import { frSan, movesText } from '@/chess/notation';
import { attackTable } from '@/chess/attacks';
import { positionReport } from '@/chess/position';
import type { Color } from '@/chess/types';
import type { GameStats, Issue, Outcome } from '@/game/types';

export interface PromptContext {
  userColor: Color;
  /** e.g. "1250 Elo sur chess.com et 1575 Elo sur Lichess". */
  rating: string;
}

const PERSONA = (ctx: PromptContext) =>
  `Tu es un coach d'échecs humain, chaleureux mais direct, qui tutoie son élève et parle français. L'élève a un classement d'environ ${ctx.rating}.`;

const GROUNDING = [
  "- Pour compter les attaquants et défenseurs d'une pièce, ou dire qu'une pièce est en prise, utilise UNIQUEMENT les tableaux des attaques fournis (calculés par programme). Ne compte jamais toi-même sur l'échiquier.",
  '- Ne mentionne aucun coup, même une simple poussée de pion, qui ne figure pas dans les variantes du moteur ou dans les coups déjà joués. Avant de répondre, vérifie chaque fait chiffré contre les données.',
];

const FRENCH_NOTATION =
  '- Écris les coups en notation algébrique française comme dans les données (R = Roi, D = Dame, T = Tour, F = Fou, C = Cavalier, pas de lettre pour les pions).';

/** Prompt asking the coach to explain an error the user just made (clock paused). */
export function mistakePrompt(issue: Issue, ctx: PromptContext): string {
  const user = colorName(ctx.userColor);
  const lines: (string | null)[] = [
    `${PERSONA(ctx)} Il joue les ${user} contre un moteur en partie rapide ; la pendule est en pause pendant que tu l'aides. Il vient de jouer un coup que l'analyse classe comme « ${CLASS_INFO[issue.cls].noun} ».`,
    '',
    'RÈGLES STRICTES',
    "- Tout ce qui est concret (coups, variantes, gains de matériel, menaces) doit venir des données du moteur ci-dessous. N'invente aucune variante. Si les données ne permettent pas d'affirmer quelque chose, reste général.",
    ...GROUNDING,
    `${FRENCH_NOTATION} Nomme aussi les pièces en toutes lettres quand ça aide (« ton cavalier en f3 »).`,
    "- Explique le pourquoi avec les idées d'un entraîneur : menaces, pièces non défendues, coordination, activité des pièces, sécurité du roi, structure de pions, cases faibles, complexes de couleur (fou manquant), colonnes ouvertes, plans. Utilise les faits structurels fournis quand ils sont pertinents, sans les réciter.",
    "- Pour une imprécision, l'enjeu est souvent positionnel : dis ce que le meilleur coup apporte de plus. Pour une erreur ou une gaffe, montre d'abord le problème concret.",
    "- Adapte le vocabulaire au niveau de l'élève. Pas de Markdown, pas de listes, pas de compliments, pas de phrase d'introduction.",
    '',
    'FORMAT (texte brut, ces 4 rubriques dans cet ordre, chacune commençant par son étiquette en début de ligne) :',
    "INDICE: 1 à 2 phrases qui orientent l'élève vers le problème de son coup SANS donner le meilleur coup ni sa case d'arrivée.",
    'EXPLICATION: 3 à 5 phrases : pourquoi son coup est moins bon (appuie-toi sur la réponse du moteur) et ce que le meilleur coup apporte.',
    'LEÇON: 1 à 2 phrases : le principe général à retenir pour ses prochaines parties.',
    'THÈME: 1 à 4 mots (par exemple « pièce non défendue », « clouage », « cases faibles », « roi exposé », « développement »).',
    '',
    'DONNÉES',
    `Position avant le coup de l'élève (FEN) : ${issue.fenBefore}`,
    `Trait aux ${user}.`,
    positionReport(issue.fenBefore, ctx.userColor),
    `Derniers coups : ${issue.recent || '(début de partie)'}`,
    `Coup joué par l'élève : ${frSan(issue.san)}`,
    `Évaluation du point de vue de l'élève (en pions) : ${formatScore(issue.bestScore)} avec le meilleur coup, ${formatScore(issue.afterScore)} après son coup. Chances de gain estimées : ${Math.round(issue.wpBefore)} % → ${Math.round(issue.wpAfter)} %.`,
    issue.missedMate ? 'Le meilleur coup menait à un mat forcé.' : null,
    issue.opp
      ? `CONTEXTE IMPORTANT : le coup précédent du moteur, ${frSan(issue.opp.san)}, était une ${CLASS_INFO[issue.opp.cls].noun} (éval pour l'élève : ${formatScore(issue.opp.before)} avant ce coup, ${formatScore(issue.opp.after)} après). L'élève n'en a pas profité. Son INDICE doit l'aider à voir ce que ce coup adverse a laissé (sans donner le coup gagnant), et l'EXPLICATION doit montrer comment le meilleur coup exploite l'erreur adverse.`
      : null,
    'Meilleures suites du moteur depuis la position avant le coup :',
    ...issue.topLines.map((l, i) => `  ${i + 1}) ${l.text} (éval ${l.eval})`),
    issue.refutationText
      ? `Meilleure réponse du moteur au coup joué, avec la suite : ${issue.refutationText}`
      : 'Le moteur ne donne pas de suite après le coup joué.',
    `Tableau des attaques APRÈS le coup de l'élève (calculé par programme : batteries comprises, pièces clouées sur leur roi exclues) :\n${attackTable(issue.fenAfter)}`,
    issue.hanging.length
      ? `Pièces de l'élève attaquées et mal défendues juste après son coup : ${issue.hanging.join(' ; ')}.`
      : "Aucune pièce de l'élève n'est attaquée sans défense juste après son coup (contrôle simple).",
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/** Prompt for on-demand advice on the current position (without revealing the engine's move). */
export function advicePrompt(fen: string, topLines: string[], history: string[], ctx: PromptContext): string {
  return [
    `${PERSONA(ctx)} Il joue les ${colorName(ctx.userColor)} contre un moteur ; c'est son tour et il te demande un conseil. La pendule est en pause.`,
    '',
    "RÈGLES : appuie-toi uniquement sur les données du moteur pour le concret, n'invente aucune variante, ne donne PAS le coup du moteur ni sa case d'arrivée. Parle d'idées : menaces adverses, pièces non défendues, pièce la moins active, structure de pions, cases faibles, complexes de couleur, colonnes, sécurité du roi, plan. Notation française si tu cites un coup déjà joué. Pas de Markdown, pas de listes, pas de compliments.",
    ...GROUNDING,
    '',
    'FORMAT (texte brut, 2 rubriques dans cet ordre, chacune commençant par son étiquette en début de ligne) :',
    'CONSEIL: 2 à 3 phrases sur ce qui compte dans cette position et où chercher.',
    'PLAN: 1 à 2 phrases sur le plan général des prochains coups.',
    '',
    'DONNÉES',
    `FEN : ${fen}`,
    positionReport(fen, ctx.userColor),
    `Derniers coups : ${movesText(history, 12) || '(début de partie)'}`,
    'Meilleures suites du moteur (ne pas les révéler) :',
    ...topLines.map((l, i) => `  ${i + 1}) ${l}`),
  ].join('\n');
}

export interface SummaryData {
  outcome: Outcome;
  reason: string;
  stats: GameStats;
  hints: number;
  finalHistory: string[];
  issues: Issue[];
}

/** Prompt for the end-of-game review, judged on first attempts. */
export function summaryPrompt(data: SummaryData, ctx: PromptContext): string {
  const { stats } = data;
  const pct = (v: number | null) => (v !== null ? `${Math.round(v)} %` : 'inconnue');
  const outcome = { win: 'victoire', loss: 'défaite', draw: 'nulle' }[data.outcome];
  const errors = data.issues.map((i) => {
    const kept = i.status !== 'retried';
    const replacement = !kept && data.finalHistory[i.ply] ? frSan(data.finalHistory[i.ply]) : null;
    const theme = i.coach.sections['THEME'];
    return (
      `- ${i.moveLabel} : ${CLASS_INFO[i.cls].noun}${i.opp ? ' (occasion manquée après une erreur du moteur)' : ''}, ` +
      `chances de gain ${Math.round(i.wpBefore)} % → ${Math.round(i.wpAfter)} %, meilleur coup ${frSan(i.bestSan)}` +
      `${theme ? `, thème : ${theme}` : ''}` +
      (kept
        ? ', coup conservé dans la partie.'
        : `, coup ANNULÉ grâce au coach puis remplacé par ${replacement ?? '?'} (il n'apparaît donc pas dans la liste des coups ci-dessous).`)
    );
  });
  return [
    `Tu es un coach d'échecs humain, exigeant et direct, qui tutoie son élève (classement : ${ctx.rating}) et parle français. Fais le bilan de la partie rapide qu'il vient de jouer contre un moteur avec les ${colorName(ctx.userColor)}.`,
    '',
    'RÈGLES',
    "- Juge la partie sur ses PREMIERS ESSAIS : pendant la partie, le coach arrête la pendule et l'élève peut annuler un mauvais coup pour le rejouer. Une erreur annulée reste une erreur qu'il aurait commise en vraie partie. Ne présente jamais le fait de corriger après l'intervention du coach comme une qualité.",
    "- Si des gaffes ont été annulées, dis clairement que le résultat aurait probablement été différent sans le coach, en t'appuyant sur les chances de gain après ces gaffes.",
    '- Cite les erreurs les plus coûteuses avec leur numéro de coup. Repère les tendances (phase de jeu, type de thème, répétition du même défaut).',
    "- Appuie-toi uniquement sur les données fournies, n'invente aucun coup ni variante. Notation française. Pas de Markdown, pas de listes à puces, pas de compliments creux.",
    '',
    'FORMAT (texte brut, 3 rubriques dans cet ordre, chacune commençant par son étiquette en début de ligne) :',
    "BILAN: 3 à 4 phrases, honnêtes, centrées sur les erreurs du premier essai et ce qu'elles auraient coûté.",
    "POINTS FORTS: 1 à 2 phrases seulement si les données montrent un vrai point fort (par exemple une phase sans erreur au premier essai) ; sinon écris qu'il n'y en a pas de net dans cette partie.",
    "À TRAVAILLER: 2 ou 3 axes concrets tirés des erreurs, avec un type d'exercice pour chacun, en phrases.",
    '',
    'DONNÉES',
    `Résultat : ${outcome} (${data.reason}), en ${stats.moves} coups de l'élève.`,
    `Précision au premier essai (méthode Lichess) : ${pct(stats.accuracy)}. Après corrections avec le coach : ${pct(stats.accuracyFinal)}.`,
    `Erreurs au premier essai : ${stats.counts.blunder} gaffe(s), ${stats.counts.mistake} erreur(s), ${stats.counts.inaccuracy} imprécision(s). Coups annulés puis rejoués : ${stats.retried}, dont ${stats.rewoundBlunders} gaffe(s). Erreurs supplémentaires commises en rejouant : ${stats.extraErrors}.`,
    `Erreurs ou gaffes du moteur : ${stats.oppErrors}, dont ${stats.oppMissed} que l'élève n'a pas exploitées du premier coup. Conseils demandés : ${data.hints}.`,
    `Coups finalement joués (après corrections) : ${movesText(data.finalHistory, 400)}`,
    errors.length
      ? `Détail des erreurs, dans l'ordre :\n${errors.join('\n')}`
      : 'Aucune imprécision détectée.',
  ].join('\n');
}
