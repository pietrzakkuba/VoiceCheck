// Data schema: speech tempo and breathing only.

/** 'reading' and 'free_speech' are legacy modes kept only for sessions recorded before the presentation library. */
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

export interface Tip {
  key: string;
  severity: TipSeverity;
  title: string;
  detail: string;
  atMs?: number;
}

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
  /** Presentation time limit at the moment recording started. */
  targetDurationSeconds?: number;
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

/** A text the user prepares to present and rehearses repeatedly. */
export interface Presentation {
  id: string;
  title: string;
  text: string;
  /** Planned speaking time; undefined = no time limit. */
  targetDurationSeconds?: number;
  createdAt: number;
  updatedAt: number;
}

export interface UserBaseline {
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
