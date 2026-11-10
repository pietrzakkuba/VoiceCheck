import type { JSONContent } from '@tiptap/core';
import type { Lang } from '@/i18n/lang';

// Data schema: speech tempo and breathing only.

/** 'free_speech' = reading a text not stored in the app (pace and breathing only). 'reading' is a legacy mode kept only for sessions recorded before the presentation library. */
export type TrainingMode = 'calibration' | 'presentation' | 'reading' | 'free_speech';

export interface SpeechSegment {
  startMs: number;
  endMs: number;
}

export interface FrameFeatures {
  /** 10 ms hop, 50 ms window intensity in dBFS */
  db: Float32Array;
  /** normalized autocorrelation peak (0..1) in the F0 range */
  voicing: Float32Array;
}

/** Tempo class of a phrase relative to the user's target range. */
export type PhraseTempo = 'short' | 'slow' | 'ok' | 'fast' | 'too_fast';

/** Continuous speech between two breath pauses (≥350 ms). */
export interface Phrase {
  startMs: number;
  endMs: number;
  syllables: number;
  /** Articulation rate in syllables/s. */
  rate: number;
  pauseAfterMs: number;
  overLimit: boolean;
  tempo: PhraseTempo;
}

export interface Pause {
  startMs: number;
  endMs: number;
  kind: 'breath' | 'long';
}

export interface SessionMetrics {
  /** Syllables per second of speech (pauses excluded). */
  articulationRate: number;
  /** Syllables per second including pauses. */
  speechRate: number;
  wpm: number;
  syllables: number;
  speechMs: number;
  phraseCount: number;
  breathCount: number;
  breathsPerMinute: number;
  longestPhraseMs: number;
  meanPhraseMs: number;
  overLimitPhrases: number;
  fastPhrases: number;
  meanPauseMs: number;
  snrDb: number;
}

export type TipSeverity = 'bad' | 'warn' | 'ok' | 'info';

export type TipKey = 'no_speech' | 'breath_limit' | 'too_fast' | 'too_slow' | 'speeding_up' | 'noise' | 'all_ok';

/** Report tip; its text is localized when displayed, from the key and params. */
export interface Tip {
  key: TipKey;
  severity: TipSeverity;
  /** Numbers the localized text is built from. */
  params?: Record<string, number>;
  /** Legacy Polish text stored before the app was localized. */
  title?: string;
  detail?: string;
  atMs?: number;
}

/** Stored session warning codes; older sessions may contain Polish text instead. */
export type SessionWarning = 'clipping';

/** Settings the session was analysed with (thresholds shown in the report). */
export interface AnalysisSettings {
  targetArticulationRate: [number, number];
  maxContinuousSpeechSeconds: number;
  syllableCorrection: number;
  syllablesPerWord: number;
}

export interface SessionTracks {
  /** Downsampled absolute peak waveform (~100 points/s) */
  waveform: number[];
  speechSegments: SpeechSegment[];
  /** Raw (uncorrected) syllable nucleus times in ms – lets a session be recomputed after recalibration. */
  nucleiMs: number[];
}

export interface TrainingSession {
  schema: 2;
  id: string;
  timestamp: number;
  mode: TrainingMode;
  targetText?: string;
  /** Presentation this session was a rehearsal of. */
  presentationId?: string;
  /** Speech language (selects the calibration). Missing for sessions recorded before English support (Polish). */
  language?: Lang;
  deviceLabel: string;
  durationSeconds: number;
  audioKey: string;
  audioOffsetMs?: number;
  noiseFloorDb: number;
  settings: AnalysisSettings;
  metrics: SessionMetrics;
  phrases: Phrase[];
  pauses: Pause[];
  tips: Tip[];
  tracks: SessionTracks;
  warnings: string[];
}

export interface PresentationDocument {
  version: 1;
  content: JSONContent;
}

/** A text the user prepares to present and rehearses repeatedly. */
export interface Presentation {
  id: string;
  title: string;
  text: string;
  /** Optional for presentations saved before rich-text editing. */
  document?: PresentationDocument;
  /** Missing for presentations created before English support (Polish). */
  language?: Lang;
  createdAt: number;
  updatedAt: number;
}

export interface UserBaseline {
  /** Missing for calibrations made before English support (Polish). */
  language?: Lang;
  createdAt: number;
  deviceLabel: string;
  articulationRate: number;
  syllablesPerWord: number;
  liveSyllableCorrection: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  targetArticulationRate: [number, number];
  maxContinuousSpeechSeconds: number;
  /** Sound + vibration when the breath limit is exceeded. */
  breathAlert: boolean;
}
