<script setup lang="ts">
import { computed } from 'vue';
import { CLASS_INFO, possessive } from '@/chess/constants';
import { formatScore } from '@/chess/evaluation';
import { frSan, pieceTypeAt } from '@/chess/notation';
import type { Issue } from '@/game/types';
import CoachSection from './CoachSection.vue';
import CoachStatus from './CoachStatus.vue';

const props = defineProps<{ issue: Issue; live: boolean; review: boolean; undoable?: boolean }>();
const emit = defineEmits<{ retry: []; solution: []; continue: []; undo: []; recoach: []; back: [] }>();

const info = computed(() => CLASS_INFO[props.issue.cls]);
const showSolution = computed(() => props.issue.solutionShown || props.review);
const sections = computed(() => props.issue.coach.sections);

/** Engine-only hint, shown until (or instead of) the coach's own hint. */
const engineHint = computed(() => {
  const issue = props.issue;
  if (issue.opp) {
    return `Son dernier coup, ${frSan(issue.opp.san)} (flèche jaune), était une ${CLASS_INFO[issue.opp.cls].noun} et tu ne l'as pas exploitée. Le plateau montre la position avant ton coup : regarde ce que ce coup a laissé sans défense, affaibli ou dégarni.`;
  }
  if (issue.missedMate)
    return 'Tu avais un mat forcé en quelques coups : cherche les échecs et les coups qui enferment le roi adverse.';
  const r = issue.refutationUci[0];
  if (r && issue.cls !== 'inaccuracy') {
    const type = pieceTypeAt(issue.fenAfter, r.slice(0, 2));
    const what = type ? possessive(type, 'son') : 'ce qui est';
    return `Regarde ce que l'adversaire peut faire maintenant avec ${what} en ${r.slice(0, 2)} (case entourée en rouge).`;
  }
  return "Un autre coup améliorait davantage ta position. Avant de rejouer, regarde quelle pièce est la moins active et ce que l'adversaire prépare.";
});
</script>

<template>
  <div class="card coach" :class="issue.cls">
    <div class="head">
      <span class="badge" :class="issue.cls"
        >{{ issue.opp ? 'Occasion manquée' : info.label }} {{ info.mark }}</span
      >
      <span class="what">
        {{ issue.moveLabel }}
        <span class="muted"
          >· éval pour toi {{ formatScore(issue.bestScore) }} → {{ formatScore(issue.afterScore) }}</span
        >
      </span>
    </div>
    <p v-if="!live && !review" class="muted small">
      {{ issue.status === 'retried' ? 'Coup rejoué.' : 'Partie reprise.' }} Le coach continue d'écrire
      ci-dessous si besoin.
    </p>
    <div v-if="undoable" class="btn-row">
      <button class="btn" title="Annule « Continuer » et remet la pendule en pause" @click="emit('undo')">
        ↶ Revenir à l'erreur
      </button>
    </div>

    <CoachSection title="Indice" :text="sections['INDICE'] || engineHint" variant="hint" />

    <div v-if="live" class="btn-row">
      <button class="btn primary" @click="emit('retry')">↺ Rejouer le coup</button>
      <button v-if="!showSolution" class="btn" @click="emit('solution')">Voir la solution</button>
      <button class="btn" @click="emit('continue')">Continuer ▶</button>
    </div>

    <template v-if="showSolution">
      <CoachSection
        title="Meilleur coup"
        :text="`${frSan(issue.bestSan)} (${issue.topLines[0]?.eval}) — suite : ${issue.topLines[0]?.text}`"
        variant="best"
      />
      <CoachSection
        title="Ce que le moteur répondait à ton coup"
        :text="issue.refutationText"
        variant="refutation"
      />
      <CoachSection title="Explication" :text="sections['EXPLICATION']" />
      <CoachSection title="À retenir" :text="sections['LECON']" variant="lesson" />
      <p v-if="sections['THEME']" class="theme">Thème : {{ sections['THEME'] }}</p>
      <p v-if="live" class="muted small">
        Le plateau montre la position avant ton coup : flèche rouge = ton coup, flèche verte = le meilleur.
      </p>
      <p v-if="issue.opp" class="muted small">
        Erreur adverse exploitable : {{ frSan(issue.opp.san) }} (éval pour toi
        {{ formatScore(issue.opp.before) }} → {{ formatScore(issue.opp.after) }}).
      </p>
    </template>

    <CoachStatus :answer="issue.coach" @retry="emit('recoach')" />

    <div v-if="review" class="btn-row">
      <button class="btn primary" @click="emit('back')">Retour à la position finale</button>
    </div>
  </div>
</template>

<style scoped>
.coach.inaccuracy {
  border-left: 4px solid var(--inaccuracy);
}
.coach.mistake {
  border-left: 4px solid var(--mistake);
}
.coach.blunder {
  border-left: 4px solid var(--blunder);
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.what {
  font-weight: 600;
}
.theme {
  margin: 8px 0 0;
  font-size: 12.5px;
  color: var(--muted);
}
</style>
