import type { Move } from 'chess.js';

/**
 * Board sounds, synthesized with the Web Audio API: no audio files to download or license, and nothing
 * for the Content Security Policy to allow. Several sets share the same recipes (a capture is two
 * pieces knocking, a check is a piece plus a note…) and differ by their voice.
 */
export type SoundName =
  'move' | 'capture' | 'castle' | 'check' | 'promote' | 'coach' | 'win' | 'loss' | 'draw';

export type SoundSetId = 'wood' | 'soft' | 'creamy' | 'glass' | 'retro' | 'off';

export const SOUND_SETS: { id: SoundSetId; label: string; description: string }[] = [
  { id: 'wood', label: 'Bois', description: 'Le claquement net d’une pièce posée sur un échiquier en bois.' },
  { id: 'soft', label: 'Doux', description: 'Des sons ronds et discrets, pour jouer sans être dérangé.' },
  {
    id: 'creamy',
    label: 'Crémeux',
    description: 'Un « thock » grave et feutré, comme les claviers mécaniques dits creamy.',
  },
  { id: 'glass', label: 'Cristal', description: 'Des tintements clairs et légers.' },
  { id: 'retro', label: 'Rétro', description: 'Des bips 8 bits de vieille console.' },
  { id: 'off', label: 'Aucun', description: 'Aucun son.' },
];

/** Sound for a move just played: check first, then promotion, capture, castling. */
export function moveSound(move: Pick<Move, 'san' | 'flags'>): SoundName {
  if (/[+#]$/.test(move.san)) return 'check';
  if (move.flags.includes('p')) return 'promote';
  if (/[ce]/.test(move.flags)) return 'capture';
  if (/[kq]/.test(move.flags)) return 'castle';
  return 'move';
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let currentSet: SoundSetId = 'wood';
let volume = 0.7;
/** Set by the first click or key press: before it, browsers keep audio suspended. */
let unlocked = false;

/** Volume from 0 to 1; the slider is squared so that it feels even to the ear. */
export function configureSound(set: SoundSetId, vol: number): void {
  currentSet = set;
  volume = Math.max(0, Math.min(1, vol));
  if (master) master.gain.value = volume * volume;
}

function output(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume * volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return { ctx, out: master! };
}

/** Browsers only start audio from a user gesture: create or resume the context on each click or key. */
export function unlockAudioOnGesture(): void {
  if (typeof window === 'undefined') return;
  const unlock = () => {
    unlocked = true;
    if (currentSet !== 'off' && ctx?.state !== 'running') output();
  };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}

/**
 * Plays a sound now, or after `delayMs`, with the chosen set (or `set`, to preview another one).
 * Silent with the "off" set, at volume 0, or before any user gesture.
 */
export function playSound(name: SoundName, delayMs = 0, set: SoundSetId = currentSet): void {
  if (set === 'off' || volume <= 0 || !unlocked) return;
  const audio = output();
  if (!audio) return;
  try {
    synthesize(name, set, audio.ctx, audio.out, audio.ctx.currentTime + 0.005 + delayMs / 1000);
  } catch (e) {
    console.warn('sound failed', e);
  }
}

// ---- synthesis primitives --------------------------------------------------

type Ctx = BaseAudioContext;

const noiseBuffers = new WeakMap<Ctx, AudioBuffer>();

function noise(ac: Ctx): AudioBuffer {
  let buf = noiseBuffers.get(ac);
  if (!buf) {
    buf = ac.createBuffer(1, Math.round(ac.sampleRate * 0.1), ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ac, buf);
  }
  return buf;
}

/** Fast attack, exponential decay. */
function envelope(ac: Ctx, t: number, gain: number, attack: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function lowpass(ac: Ctx, freq: number, q = 0.7): BiquadFilterNode {
  const f = ac.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

interface ToneOptions {
  freq: number;
  /** Pitch at the end of the decay, for a falling thump. */
  endFreq?: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  decay: number;
  /** Low-pass cutoff, to muffle the tone. */
  cutoff?: number;
}

function tone(ac: Ctx, out: AudioNode, t: number, o: ToneOptions): void {
  const attack = o.attack ?? 0.004;
  const osc = ac.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.endFreq) osc.frequency.exponentialRampToValueAtTime(o.endFreq, t + attack + o.decay);
  const env = envelope(ac, t, o.gain, attack, o.decay);
  (o.cutoff ? osc.connect(lowpass(ac, o.cutoff)) : osc).connect(env).connect(out);
  osc.start(t);
  osc.stop(t + attack + o.decay + 0.05);
}

/** Filtered noise burst: the contact of a piece with the board. */
function burst(
  ac: Ctx,
  out: AudioNode,
  t: number,
  o: { filter: BiquadFilterType; freq: number; q: number; gain: number; decay: number },
): void {
  const src = ac.createBufferSource();
  src.buffer = noise(ac);
  const filter = ac.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.value = o.freq;
  filter.Q.value = o.q;
  src
    .connect(filter)
    .connect(envelope(ac, t, o.gain, 0.001, o.decay))
    .connect(out);
  src.start(t);
  src.stop(t + o.decay + 0.03);
}

// ---- voices ----------------------------------------------------------------

interface Voice {
  /** A piece set down; `pitch` and `gain` vary it for captures and castling. */
  piece(ac: Ctx, out: AudioNode, t: number, pitch: number, gain: number): void;
  /** One note of a chime: check, promotion, coach pause, end of game. */
  note(ac: Ctx, out: AudioNode, t: number, freq: number, gain: number, decay: number): void;
}

const VOICES: Record<Exclude<SoundSetId, 'off'>, Voice> = {
  wood: {
    piece(ac, out, t, p, g) {
      tone(ac, out, t, {
        freq: 240 * p,
        endFreq: 130 * p,
        type: 'triangle',
        gain: 0.6 * g,
        attack: 0.002,
        decay: 0.09,
      });
      tone(ac, out, t, { freq: 820 * p, endFreq: 560 * p, gain: 0.22 * g, attack: 0.001, decay: 0.035 });
      burst(ac, out, t, { filter: 'bandpass', freq: 2300 * p, q: 0.9, gain: 0.9 * g, decay: 0.03 });
    },
    note(ac, out, t, freq, gain, decay) {
      tone(ac, out, t, { freq, gain, decay });
      tone(ac, out, t, { freq: freq * 2, gain: gain * 0.25, decay: decay * 0.6 });
    },
  },
  soft: {
    piece(ac, out, t, p, g) {
      tone(ac, out, t, { freq: 200 * p, endFreq: 120 * p, gain: 0.55 * g, attack: 0.006, decay: 0.12 });
      burst(ac, out, t, { filter: 'lowpass', freq: 1100 * p, q: 0.5, gain: 0.3 * g, decay: 0.04 });
    },
    note(ac, out, t, freq, gain, decay) {
      tone(ac, out, t, { freq, gain: gain * 0.8, attack: 0.02, decay: decay * 1.2 });
    },
  },
  creamy: {
    piece(ac, out, t, p, g) {
      tone(ac, out, t, {
        freq: 200 * p,
        endFreq: 100 * p,
        type: 'triangle',
        gain: 0.7 * g,
        attack: 0.003,
        decay: 0.11,
        cutoff: 900,
      });
      tone(ac, out, t, { freq: 120 * p, endFreq: 80 * p, gain: 0.4 * g, attack: 0.004, decay: 0.13 });
      burst(ac, out, t, { filter: 'lowpass', freq: 850 * p, q: 1.5, gain: 1.2 * g, decay: 0.05 });
    },
    note(ac, out, t, freq, gain, decay) {
      tone(ac, out, t, { freq, type: 'triangle', gain, attack: 0.008, decay, cutoff: freq * 2.5 });
      tone(ac, out, t, { freq: freq / 2, gain: gain * 0.3, attack: 0.008, decay: decay * 0.8 });
    },
  },
  glass: {
    piece(ac, out, t, p, g) {
      tone(ac, out, t, { freq: 1800 * p, endFreq: 1750 * p, gain: 0.28 * g, attack: 0.001, decay: 0.12 });
      tone(ac, out, t, { freq: 1800 * 2.76 * p, gain: 0.08 * g, attack: 0.001, decay: 0.05 });
      burst(ac, out, t, { filter: 'bandpass', freq: 6000 * p, q: 2, gain: 0.4 * g, decay: 0.012 });
    },
    note(ac, out, t, freq, gain, decay) {
      tone(ac, out, t, { freq, gain, attack: 0.002, decay: decay * 1.3 });
      tone(ac, out, t, { freq: freq * 2.76, gain: gain * 0.2, attack: 0.002, decay: decay * 0.5 });
      tone(ac, out, t, { freq: freq * 5.4, gain: gain * 0.08, attack: 0.002, decay: decay * 0.25 });
    },
  },
  retro: {
    piece(ac, out, t, p, g) {
      tone(ac, out, t, {
        freq: 520 * p,
        endFreq: 260 * p,
        type: 'square',
        gain: 0.17 * g,
        attack: 0.001,
        decay: 0.05,
      });
    },
    note(ac, out, t, freq, gain, decay) {
      tone(ac, out, t, { freq, type: 'square', gain: gain * 0.55, attack: 0.002, decay: decay * 0.6 });
    },
  },
};

function notes(
  v: Voice,
  ac: Ctx,
  out: AudioNode,
  t: number,
  freqs: number[],
  step: number,
  gain: number,
  decay: number,
): void {
  freqs.forEach((freq, i) => v.note(ac, out, t + i * step, freq, gain, decay));
}

/** Schedules `name` at time `t` on any audio context (an OfflineAudioContext too, to inspect it). */
export function synthesize(name: SoundName, set: SoundSetId, ac: Ctx, out: AudioNode, t: number): void {
  if (set === 'off') return;
  const v = VOICES[set];
  switch (name) {
    case 'move':
      return v.piece(ac, out, t, 1, 1);
    case 'capture':
      v.piece(ac, out, t, 0.85, 1.15);
      return v.piece(ac, out, t + 0.045, 1.3, 0.7);
    case 'castle':
      v.piece(ac, out, t, 1, 1);
      return v.piece(ac, out, t + 0.12, 1.12, 0.85);
    case 'check':
      v.piece(ac, out, t, 1, 1);
      return v.note(ac, out, t + 0.02, 988, 0.22, 0.35);
    case 'promote':
      v.piece(ac, out, t, 1, 1);
      return notes(v, ac, out, t + 0.06, [784, 988, 1175], 0.07, 0.14, 0.18);
    case 'coach':
      return notes(v, ac, out, t, [740, 554], 0.13, 0.16, 0.3);
    case 'win':
      return notes(v, ac, out, t, [523, 659, 784, 1047], 0.11, 0.16, 0.5);
    case 'loss':
      return notes(v, ac, out, t, [440, 370, 294], 0.16, 0.16, 0.55);
    case 'draw':
      return notes(v, ac, out, t, [523, 659], 0.16, 0.16, 0.5);
  }
}
