// Thresholds for live tempo/breath feedback and the session report.
export const T = {
  // noise / VAD
  snrWarnDb: 12,
  vadStart: 0.5,
  vadEnd: 0.35,
  clipRatio: 0.01,

  // breath
  /** A silence at least this long counts as a breath and splits phrases. */
  breathPauseMs: 350,
  breathWarnRatio: 0.75,
  /** Pauses longer than this are marked as long. */
  longPauseMs: 2000,

  // syllable nuclei
  nucleusProminenceDb: 2,
  nucleusAboveNoiseDb: 10,
  nucleusVoicing: 0.45,
  nucleusMinGapMs: 100,
  liveWindowMs: 10000,
  liveMinSpeechMs: 3000,
  defaultSyllablesPerWord: 2.3,

  // phrase tempo
  /** Phrases shorter than this (or with fewer syllables) are too short for a reliable rate. */
  phraseMinMs: 1500,
  phraseMinSyl: 4,
  /** Share of fast phrases that triggers the "speeding up" tip. */
  fastPhraseShare: 0.25,

  // calibration
  correctionMin: 0.6,
  correctionMax: 1.6,
} as const;
