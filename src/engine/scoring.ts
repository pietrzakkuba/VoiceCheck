import type { ScoreWeights } from '@/types';

export const clamp = (x: number, a = 0, b = 100) => Math.min(b, Math.max(a, x));

export interface TempoScoreInput {
  ar: number;
  arRange: [number, number];
  rushedIpuRatio: number;
  pacerMeanAbsDevMs?: number;
}

/** Each component returns the score plus named deductions (used for "Top 3"). */
export interface Component {
  score: number;
  deductions: Record<string, number>;
}

export function tempoScore(i: TempoScoreInput): Component {
  if (i.pacerMeanAbsDevMs !== undefined) {
    const d = 0.1 * i.pacerMeanAbsDevMs;
    return { score: clamp(100 - d), deductions: { pacer: Math.min(100, d) } };
  }
  const [lo, hi] = i.arRange;
  let base = 100;
  const ded: Record<string, number> = {};
  if (i.ar > hi) { base = clamp(100 * (1 - (i.ar - hi) / 2)); ded.tooFast = 100 - base; }
  else if (i.ar < lo && i.ar > 0) { base = clamp(100 * (1 - (lo - i.ar) / 2)); ded.tooSlow = 100 - base; }
  const rushed = 30 * i.rushedIpuRatio;
  if (rushed > 0) ded.rushed = Math.min(base, rushed);
  return { score: clamp(base - rushed), deductions: ded };
}

/** weighted: per flag type, sum of weights (1 high / 0.5 medium); n = scored words. */
export function articulationScore(weighted: Record<string, number>, n: number): Component {
  if (n <= 0) return { score: 100, deductions: {} };
  const ded: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(weighted)) {
    const d = (200 * v) / n;
    ded[k] = d;
    total += d;
  }
  if (total > 100) for (const k of Object.keys(ded)) ded[k] = (ded[k] * 100) / total;
  return { score: clamp(100 - total), deductions: ded };
}

export function dictionLabScore(okUnits: number, totalUnits: number): Component {
  if (!totalUnits) return { score: 100, deductions: {} };
  const s = (100 * okUnits) / totalUnits;
  return { score: clamp(s), deductions: { diction: 100 - s } };
}

export interface FluencyInput {
  minutes: number;
  fillers: number;
  noBreathRatio: number;
  missingPauseRatio: number;
  hesitations: number;
  repetitions: number;
}

export function fluencyScore(i: FluencyInput): Component {
  const m = Math.max(i.minutes, 0.25);
  const ded = {
    fillers: Math.min(40, (8 * i.fillers) / m),
    noBreath: Math.min(30, 30 * i.noBreathRatio),
    missingPause: Math.min(30, 30 * i.missingPauseRatio),
    hesitation: Math.min(20, (5 * i.hesitations) / m),
    repetition: Math.min(10, (3 * i.repetitions) / m),
  };
  const total = Object.values(ded).reduce((a, b) => a + b, 0);
  return { score: clamp(100 - total), deductions: ded };
}

export interface ProsodyScoreInput {
  swallowedRatio: number;
  f0RangeSt: number | null;
  volumeDecline: boolean;
  lowSnr: boolean;
}

export function prosodyScore(i: ProsodyScoreInput): Component {
  const ends = clamp(100 * (1 - 1.5 * i.swallowedRatio));
  const inton = i.f0RangeSt === null ? 100 : 100 * clamp((i.f0RangeSt - 1) / 4, 0, 1);
  const vol = clamp(100 - (i.volumeDecline ? 50 : 0) - (i.lowSnr ? 50 : 0));
  return {
    score: clamp(0.5 * ends + 0.3 * inton + 0.2 * vol),
    deductions: {
      sentenceEnds: 0.5 * (100 - ends),
      monotone: 0.3 * (100 - inton),
      volumeDecline: i.volumeDecline ? 0.2 * 50 : 0,
      lowSnr: i.lowSnr ? 0.2 * 50 : 0,
    },
  };
}

export function totalScore(s: { tempo: number; articulation: number; fluency: number; prosody: number }, w: ScoreWeights) {
  const sum = w.tempo + w.articulation + w.fluency + w.prosody || 1;
  return clamp((w.tempo * s.tempo + w.articulation * s.articulation + w.fluency * s.fluency + w.prosody * s.prosody) / sum);
}
