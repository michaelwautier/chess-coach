<script setup lang="ts">
import { computed, ref } from 'vue';
import { CLASS_INFO } from '@/chess/constants';
import { frSan } from '@/chess/notation';
import type { GameRecord, GameResult, Issue } from '@/game/types';
import CoachSection from './CoachSection.vue';
import CoachStatus from './CoachStatus.vue';

const props = defineProps<{
  result: GameResult;
  issues: Issue[];
  hints: number;
  adaptive: boolean;
  pgn: string;
  /** Set when showing a past game rather than the one just played. */
  replay?: { record: GameRecord; hasDetails: boolean } | null;
}>();
const emit = defineEmits<{ review: [issue: Issue]; again: []; settings: []; resummarize: [] }>();

const TITLES = { win: 'Victoire', loss: 'Défaite', draw: 'Nulle' } as const;
const stats = computed(() => props.result.stats);
const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)} %`);
const sections = computed(() => props.result.summary.sections);
const detailsText = computed(() => {
  const s = stats.value;
  const parts: string[] = [];
  if (s.retried && s.accuracyFinal !== null) parts.push(`Après tes corrections : ${pct(s.accuracyFinal)}.`);
  if (s.extraErrors) parts.push(`${s.extraErrors} erreur(s) de plus en rejouant.`);
  if (s.oppErrors) {
    parts.push(
      `L'adversaire a fait ${s.oppErrors} erreur(s) ou gaffe(s) : tu en as raté ${s.oppMissed} du premier coup.`,
    );
  }
  return parts.join(' ');
});

const replayDate = computed(() => {
  const record = props.replay?.record;
  if (!record) return '';
  const d = new Date(record.date);
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `Partie du ${day} à ${time} · ${record.tc}`;
});

const levelText = computed(() => {
  const r = props.result;
  const parts = [
    props.replay
      ? `Niveau du moteur : ${r.levelBefore}.`
      : r.levelAfter !== r.levelBefore
        ? `Niveau du moteur : ${r.levelBefore} → ${r.levelAfter} pour la prochaine partie.`
        : `Niveau du moteur : ${r.levelBefore}${props.adaptive ? ` (inchangé${r.levelNote ? ` : ${r.levelNote}` : ''})` : ''}.`,
  ];
  if (stats.value.retried) parts.push(`${stats.value.retried} coup(s) rejoué(s).`);
  if (props.hints) parts.push(`${props.hints} conseil(s) demandé(s).`);
  return parts.join(' ');
});

const pgnNote = ref('');
const showPgn = ref(false);

async function copyPgn(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.pgn);
    pgnNote.value = 'PGN copié : tu peux le coller dans l’analyse Lichess.';
  } catch {
    showPgn.value = true;
  }
}
</script>

<template>
  <div class="card over">
    <div class="title" :class="`result-${result.outcome}`">
      {{ TITLES[result.outcome] }} <span class="muted">· {{ result.reason }}</span>
    </div>
    <p v-if="replay" class="muted small date">{{ replayDate }}</p>
    <p v-if="replay && !replay.hasDetails" class="small note">
      Partie enregistrée avant la revue détaillée : tu peux rejouer les coups, mais les jugements coup par
      coup et les explications du coach n'ont pas été gardés.
    </p>
    <div class="stats">
      <div>
        <b>{{ pct(stats.accuracy) }}</b><span>précision 1er essai</span>
      </div>
      <div>
        <b class="mark-inaccuracy">{{ stats.counts.inaccuracy }}</b><span>imprécisions</span>
      </div>
      <div>
        <b class="mark-mistake">{{ stats.counts.mistake }}</b><span>erreurs</span>
      </div>
      <div>
        <b class="mark-blunder">{{ stats.counts.blunder }}</b><span>gaffes</span>
      </div>
    </div>
    <p v-if="detailsText" class="small">{{ detailsText }}</p>
    <p class="small">{{ levelText }}</p>
    <p class="muted small">
      Précision calculée comme sur Lichess : moyenne pondérée par la volatilité et moyenne harmonique, qui
      pèse lourd sur les grosses erreurs. Les compteurs et le chiffre principal portent sur ton premier essai
      à chaque coup.
    </p>

    <CoachSection title="Bilan du coach" :text="sections['BILAN']" />
    <CoachSection title="Points forts" :text="sections['POINTS FORTS']" />
    <CoachSection title="À travailler" :text="sections['A TRAVAILLER']" variant="lesson" />
    <CoachStatus :answer="result.summary" @retry="emit('resummarize')" />

    <div v-if="issues.length" class="review">
      <h4>Revoir tes erreurs</h4>
      <button v-for="issue in issues" :key="issue.id" class="btn item" @click="emit('review', issue)">
        <span class="badge" :class="issue.cls">{{ CLASS_INFO[issue.cls].mark }}</span>
        {{ issue.moveLabel }}
        <span class="muted">
          → {{ frSan(issue.bestSan) }}{{ issue.opp ? ' · occasion manquée' : ''
          }}{{ issue.status === 'retried' ? ' · rejoué' : '' }}
        </span>
      </button>
    </div>

    <div class="btn-row">
      <button class="btn primary" @click="emit('again')">Nouvelle partie</button>
      <button class="btn" @click="emit('settings')">{{ replay ? 'Retour' : 'Réglages' }}</button>
      <button class="btn" @click="copyPgn">Copier le PGN</button>
    </div>
    <p v-if="pgnNote" class="small muted">{{ pgnNote }}</p>
    <textarea v-if="showPgn" class="pgn" readonly :value="pgn" />
  </div>
</template>

<style scoped>
.title {
  font-size: 20px;
  font-weight: 700;
}
.date {
  margin: 2px 0 0;
}
.note {
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--panel-2);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin: 12px 0 6px;
}
.stats div {
  display: grid;
  padding: 8px 4px;
  border-radius: 9px;
  background: var(--panel-2);
  text-align: center;
}
.stats b {
  font-size: 19px;
}
.stats span {
  font-size: 11.5px;
  color: var(--muted);
}
.review {
  margin-top: 12px;
  display: grid;
  gap: 6px;
}
.review h4 {
  margin: 0 0 3px;
  font-size: 12px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--muted);
}
.item {
  text-align: left;
}
.pgn {
  width: 100%;
  min-height: 110px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel-2);
  color: var(--text);
  font:
    12px ui-monospace,
    monospace;
}
</style>
