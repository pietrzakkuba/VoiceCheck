import type { Flag, FlagType, PacerInfo, RawWord, Severity, Confidence, SkippedWord, SpeechSegment, TrainingMode, UnitCategory, UserBaseline } from '@/types';

/** Everything the scoring engine needs about one recorded answer. */
export interface AnalysisInput {
  mode: TrainingMode;
  /** Reference text known (reading, pacer, diction, calibration, repeat). */
  reading: boolean;
  targetText?: string;
  durationMs: number;
  speech: SpeechSegment[];
  db: ArrayLike<number>;
  voicing: ArrayLike<number>;
  f0: ArrayLike<number>;
  mfccDelta: ArrayLike<number>;
  noiseFloorDb: number;
  words: RawWord[];
  skipped: SkippedWord[];
  /** False when ASR/alignment did not run (models not downloaded yet). */
  asrAvailable: boolean;
  /** False for the Lite tier (no CTC → no GOP). */
  gopAvailable: boolean;
  /** Number of syllable nuclei detected live (for correction factor). */
  liveNuclei: number;
  settings: {
    targetArticulationRate: [number, number];
    maxContinuousSpeechSeconds: number;
    scoreWeights: { tempo: number; articulation: number; fluency: number; prosody: number };
    liveSyllableCorrection: number;
  };
  baseline: UserBaseline | null;
  pacer?: PacerInfo;
  dictionCategory?: UnitCategory | 'zbitki' | 'rl';
}

export function mkFlag(
  type: FlagType,
  severity: Severity,
  confidence: Confidence,
  startMs: number,
  endMs: number,
  message: string,
  extra: Partial<Flag> = {},
): Flag {
  return { type, severity, confidence, startMs: Math.round(startMs), endMs: Math.round(endMs), message, ...extra };
}

export const FRAME_MS = 10;

export function frameRange(arr: ArrayLike<number>, startMs: number, endMs: number): number[] {
  const a = Math.max(0, Math.floor(startMs / FRAME_MS));
  const b = Math.min(arr.length, Math.ceil(endMs / FRAME_MS));
  const out: number[] = [];
  for (let i = a; i < b; i++) out.push(arr[i]);
  return out;
}

export const isFillerToken = (w: string) => /^(y+|e{2,}|m{2,}|hm+|yy+m+|eh+m*|aha)$/.test(w);
