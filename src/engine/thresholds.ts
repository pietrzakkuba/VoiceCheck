// Starting values for every threshold in the spec. They are tuned with scripts/evaluate-corpus.ts (section 9).
export const T = {
  // 4.1 noise / SNR
  noiseCalibrationMs: 2000,
  snrWarnDb: 12,
  snrHighConfidenceDb: 15,
  vadStart: 0.5,
  vadEnd: 0.35,
  clipRatio: 0.01,
  clipLevel: 0.99,

  // 4.2 breath
  breathPauseMs: 350,
  breathWarnRatio: 0.75,

  // 4.3 live syllable nuclei
  nucleusProminenceDb: 2,
  nucleusAboveNoiseDb: 10,
  nucleusVoicing: 0.45,
  nucleusMinGapMs: 100,
  liveWindowMs: 10000,
  liveMinSpeechMs: 3000,
  defaultSyllablesPerWord: 2.3,
  gaugeZones: { verySlow: 3.5, okFrom: 4.0, okTo: 5.5, fastTo: 6.5 },

  // 5.1 segmentation
  chunkPauseMs: 700,
  chunkMinSpeechMs: 1500,
  chunkMaxMs: 25000,
  chunkMarginMs: 200,
  chunkSkipSpeechMs: 300,

  // 5.2 hallucinations
  hallucinationNgramRepeats: 3,
  hallucinationSyllableRatio: 2,

  // 5.5 alignment
  alignMinScore: -2.5,
  ctcMaxChunkMs: 20000,
  ctcOverlapMs: 1000,

  // 5.7 GOP
  deletedP: 0.05,
  tauAbs: 1.0,
  weakPTarget: 0.2,
  substituteMinCompP: 0.3,
  finalDevoicingTauRelax: 1.0,
  mumbledMinUnits: 2,
  mumbledRatio: 0.3,
  veryLowGopMargin: 2,

  // 5.8 tempo
  pauseMinMs: 250,
  rushedPhraseMinSyl: 5,
  rushedPhraseAbs: 6.5,
  rushedPhraseRel: 1.25,
  rushedWordMinSyl: 3,
  rushedWordRate: 8,
  accelMinIpuMs: 3000,
  accelRatio: 1.3,
  defaultBaselineAR: 5.0,

  // 5.9 pauses & fluency
  longPauseMs: 1000,
  hesitationPauseMs: 2000,
  missingSentencePauseMs: 400,
  missingCommaPauseMs: 150,
  unexpectedPauseMs: 500,
  fillerMinMs: 200,
  fillerVoicedRatio: 0.8,
  fillerF0SdSemitones: 1.5,
  fillerMfccDelta: 1.0,
  prolongationMs: 250,
  fillerWordPerMin: 2,

  // 5.10 prosody
  sentenceMinSyl: 6,
  sentenceEndRedDb: 10,
  sentenceEndStrongDb: 14,
  sentenceEndAmberDb: 8,
  monotoneSemitones: 3,
  volumeDeclineDbPerMin: -6,
  volumeDeclineMinMs: 20000,

  // 8.3 pacer
  pacerCommaMs: 600,
  pacerSentenceMs: 1200,
  pacerDeviationMs: 500,
  pacerLeadInMs: 3000,

  // 8.2 bot
  botEndSilenceMs: 3000,
} as const;

export const DEFAULT_SCORE_WEIGHTS = { tempo: 0.25, articulation: 0.35, fluency: 0.25, prosody: 0.15 };
