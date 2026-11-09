// Data schema (spec section 10) plus internal analysis types.

export type FlagType =
  | 'RUSHED_PHRASE' | 'RUSHED_WORD' | 'ACCELERATING_PHRASE'
  | 'MUMBLED_WORD' | 'SWALLOWED_WORD_ENDING' | 'SUBSTITUTED_SOUND'
  | 'SKIPPED_WORD' | 'INSERTED_WORD' | 'WRONG_WORD'
  | 'NO_BREATH' | 'MISSING_PAUSE' | 'UNEXPECTED_PAUSE' | 'HESITATION_PAUSE'
  | 'FILLER_SOUND' | 'FILLER_WORD' | 'PROLONGATION' | 'REPETITION'
  | 'SWALLOWED_SENTENCE_ENDING' | 'MONOTONE' | 'VOLUME_DECLINE' | 'LOW_SNR'
  | 'AHEAD_OF_PACER' | 'BEHIND_PACER';

export type UnitCategory =
  | 'szumiace' | 'syczace' | 'ciszace' | 'nosowe' | 'sonorne' | 'samogloski' | 'inne';

export const UNIT_CATEGORIES: UnitCategory[] = [
  'szumiace', 'syczace', 'ciszace', 'nosowe', 'sonorne', 'samogloski', 'inne',
];

export type Severity = 'red' | 'amber';
export type Confidence = 'high' | 'medium';

export interface Flag {
  type: FlagType;
  severity: Severity;
  confidence: Confidence;
  startMs: number;
  endMs: number;
  wordIndex?: number;
  unitIndex?: number;
  message: string;
  details?: Record<string, number | string>;
}

export type UnitStatus = 'ok' | 'weak' | 'substituted' | 'deleted' | 'unscorable';

export interface UnitAnalysis {
  text: string;
  category: UnitCategory;
  startMs: number;
  endMs: number;
  gop: number;
  pTarget: number;
  heardAs?: string;
  status: UnitStatus;
}

export type WordStatus = 'ok' | 'rushed' | 'mumbled' | 'filler' | 'skipped' | 'inserted' | 'unscorable';

export interface WordAnalysis {
  index: number;
  text: string;
  targetText?: string;
  startMs: number;
  endMs: number;
  syllables: number;
  alignScore: number;
  units: UnitAnalysis[];
  clarity: number | null;
  status: WordStatus;
  flagIndices: number[];
  /** Punctuation that followed the word in the reference (reading) or Whisper text (free speech). */
  boundary?: 'sentence' | 'comma';
  /** Raw per-character acoustic evidence; kept so sessions can be re-scored after recalibration. */
  chars?: AlignedChar[];
}

export interface PhraseAnalysis {
  startMs: number;
  endMs: number;
  syllables: number;
  articulationRate: number;
  pauseAfterMs: number;
}

export type TrainingMode = 'calibration' | 'bot_conversation' | 'pacer_karaoke' | 'free_reading' | 'tongue_twisters';
export type ModelTier = 'lite' | 'standard' | 'pro';

export interface SessionMetrics {
  speechRate: number;
  articulationRate: number;
  wpm: number;
  longestIpuMs: number;
  meanPauseMs: number;
  fillersPerMinute: number;
  f0RangeSemitones: number;
  snrDb: number;
}

export interface Scores {
  total: number;
  tempo: number;
  articulation: number;
  fluency: number;
  prosody: number;
}

export interface TopIssue {
  key: string;
  title: string;
  pointsLost: number;
  flagIndices: number[];
  exerciseLink?: string;
  why?: string;
  exercise?: string;
}

export interface PauseInfo {
  startMs: number;
  endMs: number;
  kind: 'normal' | 'long' | 'hesitation' | 'breath';
  atBoundary?: 'sentence' | 'comma';
}

export interface SessionTracks {
  /** 10 ms frames */
  intensityDb: number[];
  /** 10 ms frames, Hz, 0 = unvoiced */
  f0Hz: number[];
  /** Downsampled absolute peak waveform (~100 points/s) */
  waveform: number[];
  speechSegments: { startMs: number; endMs: number }[];
}

export interface PacerInfo {
  targetRate: number;
  startMs: number;
  schedule: { wordIndex: number; startMs: number; endMs: number }[];
}

export interface TrainingSession {
  id: string;
  timestamp: number;
  mode: TrainingMode;
  targetText?: string;
  deviceLabel: string;
  modelTier: ModelTier;
  durationSeconds: number;
  audioKey: string;
  metrics: SessionMetrics;
  scores: Scores;
  flags: Flag[];
  words: WordAnalysis[];
  phrases: PhraseAnalysis[];
  topIssues: TopIssue[];

  // Extensions (not in the base schema).
  analysisStatus: 'complete' | 'pending' | 'partial';
  transcript: string;
  pauses: PauseInfo[];
  tracks?: SessionTracks;
  audioOffsetMs?: number;
  pacer?: PacerInfo;
  exerciseId?: string;
  dictionCategory?: UnitCategory | 'zbitki' | 'rl';
  conversationId?: string;
  question?: string;
  repeatOf?: { sessionId: string; sentence: string };
  categoryGop?: Partial<Record<UnitCategory, { mean: number; n: number; okRatio: number }>>;
  liveSyllableRatio?: number;
  noiseFloorDb: number;
  warnings: string[];
}

export interface UserBaseline {
  createdAt: number;
  deviceLabel: string;
  gopByCategory: Record<UnitCategory, { mean: number; sd: number }>;
  articulationRate: number;
  medianIntensityDb: number;
  f0MedianHz: number;
  f0RangeSemitones: number;
  syllablesPerWord: number;
  liveSyllableCorrection: number;
}

export interface ScoreWeights {
  tempo: number;
  articulation: number;
  fluency: number;
  prosody: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  targetArticulationRate: [number, number];
  maxContinuousSpeechSeconds: number;
  modelTier: 'auto' | 'lite' | 'standard' | 'pro';
  liveCaptions: boolean;
  selectedVoiceURI: string | null;
  scoreWeights: ScoreWeights;
}

// ---------- Internal analysis types ----------

/** Acoustic evidence for one character of a word, produced by CTC forced alignment. */
export interface AlignedChar {
  char: string;
  startMs: number;
  endMs: number;
  /** Peak posterior of the target character. */
  pTarget: number;
  /** Strongest non-equivalent competitor at the peak frame. */
  competitor: string;
  pComp: number;
  gop: number;
  /** Strongest non-target, non-blank symbol over the forced segment (used when the target is missing). */
  segBest: string;
  segBestP: number;
}

export interface AlignedWord {
  text: string;
  startMs: number;
  endMs: number;
  alignScore: number;
  chars: AlignedChar[] | null;
}

export interface FrameFeatures {
  /** 10 ms hop, 50 ms window intensity in dBFS */
  db: Float32Array;
  /** normalized autocorrelation peak (0..1) in the F0 range */
  voicing: Float32Array;
}

export interface SpeechSegment {
  startMs: number;
  endMs: number;
}

/** A word handed to the scoring engine after ASR + diff + alignment. */
export interface RawWord {
  text: string;
  targetText?: string;
  /** Index into the normalized reference words (reading modes). */
  targetIndex?: number;
  op: 'match' | 'sub' | 'ins' | 'free';
  startMs: number;
  endMs: number;
  alignScore: number;
  chars: AlignedChar[] | null;
  boundary?: 'sentence' | 'comma';
  unscorable: boolean;
  timingApprox?: boolean;
}

export interface SkippedWord {
  targetText: string;
  targetIndex: number;
  atMs: number;
}
