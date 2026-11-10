// Thresholds for live tempo/breath feedback and the session report.
export const T = {
  // noise / VAD
  snrWarnDb: 12,
  vadStart: 0.5,
  vadEnd: 0.35,
  clipRatio: 0.01,

  // breath
  /** A silence at least this long counts as a breath and splits phrases. */
  breathPauseMs: 300,
  breathWarnRatio: 0.75,
  /** Pauses longer than this are marked as long. */
  longPauseMs: 2000,
  /**
   * Energy-based pause detection (complements VAD, which reacts late and often counts audible inhales as speech):
   * an unvoiced frame is quiet when it is ≥ `pauseBelowSpeechDb` below the speech level or ≤ `pauseAboveNoiseDb`
   * above the noise floor – but never closer than `pauseBelowSpeechMinDb` to the speech level.
   */
  pauseBelowSpeechDb: 20,
  pauseAboveNoiseDb: 8,
  pauseBelowSpeechMinDb: 12,

  // syllable nuclei
  nucleusProminenceDb: 2,
  nucleusAboveNoiseDb: 10,
  /** Peaks weaker than this below the recent loud-vowel level (90th pct.) are echoes/breaths, not syllables. */
  nucleusBelowPeakDb: 20,
  nucleusVoicing: 0.45,
  nucleusMinGapMs: 100,
  liveWindowMs: 10000,
  liveMinSpeechMs: 3000,
  /** Time constant of the live tempo smoothing. */
  liveSmoothingMs: 2000,
  /** Live tempo label changes only after crossing a zone boundary by this margin (syl/s). */
  liveZoneHysteresis: 0.25,
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
