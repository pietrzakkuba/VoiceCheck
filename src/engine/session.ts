import type { Pause, Phrase, PhraseTempo, SessionMetrics, SpeechSegment, Tip, TrainingSession } from '@/types';
import { mergeSegments } from './segmentation';
import { T } from './thresholds';

export interface SessionAnalysisInput {
  durationMs: number;
  /** VAD speech segments. */
  speech: SpeechSegment[];
  /** Raw syllable nucleus times (ms). */
  nucleiMs: number[];
  snrDb: number;
  /** Multiplier applied to raw nuclei counts (from calibration). */
  correction: number;
  syllablesPerWord: number;
  maxContinuousMs: number;
  targetRate: [number, number];
}

export interface SessionAnalysis {
  metrics: SessionMetrics;
  phrases: Phrase[];
  pauses: Pause[];
  tips: Tip[];
}

const NUCLEUS_MARGIN_MS = 50;

export function classifyTempo(rate: number, durMs: number, syllables: number, target: [number, number]): PhraseTempo {
  if (durMs < T.phraseMinMs || syllables < T.phraseMinSyl) return 'short';
  const [lo, hi] = target;
  if (rate > hi + 1) return 'too_fast';
  if (rate > hi) return 'fast';
  if (rate < lo - 1) return 'slow';
  return 'ok';
}

function countIn(sorted: number[], from: number, to: number): number {
  let n = 0;
  for (const t of sorted) {
    if (t > to) break;
    if (t >= from) n++;
  }
  return n;
}

/** Phrase/pause/tempo analysis of one recording. Pure, so sessions can be recomputed after recalibration. */
export function analyzeSession(input: SessionAnalysisInput): SessionAnalysis {
  const { speech, correction, targetRate, maxContinuousMs } = input;
  const nuclei = [...input.nucleiMs].sort((a, b) => a - b);
  const runs = mergeSegments(
    [...speech].filter((s) => s.endMs > s.startMs).sort((a, b) => a.startMs - b.startMs),
    T.breathPauseMs,
  );

  const phrases: Phrase[] = runs.map((r, i) => {
    const durMs = r.endMs - r.startMs;
    const syllables = Math.round(countIn(nuclei, r.startMs - NUCLEUS_MARGIN_MS, r.endMs + NUCLEUS_MARGIN_MS) * correction);
    const rate = durMs > 0 ? syllables / (durMs / 1000) : 0;
    const next = runs[i + 1];
    return {
      startMs: r.startMs,
      endMs: r.endMs,
      syllables,
      rate,
      pauseAfterMs: next ? next.startMs - r.endMs : 0,
      overLimit: durMs > maxContinuousMs,
      tempo: classifyTempo(rate, durMs, syllables, targetRate),
    };
  });

  const pauses: Pause[] = [];
  for (let i = 0; i + 1 < runs.length; i++) {
    const startMs = runs[i].endMs;
    const endMs = runs[i + 1].startMs;
    pauses.push({ startMs, endMs, kind: endMs - startMs > T.longPauseMs ? 'long' : 'breath' });
  }

  const syllables = phrases.reduce((a, p) => a + p.syllables, 0);
  const speechMs = phrases.reduce((a, p) => a + (p.endMs - p.startMs), 0);
  const spanMs = runs.length ? runs[runs.length - 1].endMs - runs[0].startMs : 0;
  const articulationRate = speechMs > 0 ? syllables / (speechMs / 1000) : 0;
  const speechRate = spanMs > 0 ? syllables / (spanMs / 1000) : 0;
  const durations = phrases.map((p) => p.endMs - p.startMs);
  const longestPhraseMs = durations.length ? Math.max(...durations) : 0;
  const overLimitPhrases = phrases.filter((p) => p.overLimit).length;
  const rated = phrases.filter((p) => p.tempo !== 'short');
  const fastPhrases = rated.filter((p) => p.tempo === 'fast' || p.tempo === 'too_fast').length;
  const pauseTotal = pauses.reduce((a, p) => a + (p.endMs - p.startMs), 0);

  const metrics: SessionMetrics = {
    articulationRate,
    speechRate,
    wpm: (speechRate * 60) / Math.max(1, input.syllablesPerWord),
    syllables,
    speechMs,
    phraseCount: phrases.length,
    breathCount: pauses.length,
    breathsPerMinute: spanMs > 0 ? pauses.length / (spanMs / 60000) : 0,
    longestPhraseMs,
    meanPhraseMs: durations.length ? speechMs / durations.length : 0,
    overLimitPhrases,
    fastPhrases,
    meanPauseMs: pauses.length ? pauseTotal / pauses.length : 0,
    snrDb: input.snrDb,
  };

  return { metrics, phrases, pauses, tips: buildTips(metrics, phrases, rated, input) };
}

/** Tips of a stored session, rebuilt from its metrics so they can be shown in any language. */
export function sessionTips(s: Pick<TrainingSession, 'metrics' | 'phrases' | 'settings'>): Tip[] {
  return buildTips(s.metrics, s.phrases, s.phrases.filter((p) => p.tempo !== 'short'), {
    targetRate: s.settings.targetArticulationRate,
    maxContinuousMs: s.settings.maxContinuousSpeechSeconds * 1000,
  });
}

function buildTips(
  m: SessionMetrics,
  phrases: Phrase[],
  rated: Phrase[],
  input: Pick<SessionAnalysisInput, 'targetRate' | 'maxContinuousMs'>,
): Tip[] {
  const tips: Tip[] = [];
  const [lo, hi] = input.targetRate;
  const limitS = Math.round(input.maxContinuousMs / 1000);

  if (m.phraseCount === 0 || m.speechMs < 2000) {
    tips.push({ key: 'no_speech', severity: 'info' });
    return tips;
  }

  if (m.overLimitPhrases > 0) {
    const first = phrases.find((p) => p.overLimit);
    tips.push({
      key: 'breath_limit',
      severity: m.overLimitPhrases / m.phraseCount > 0.3 ? 'bad' : 'warn',
      params: { count: m.overLimitPhrases, longestMs: m.longestPhraseMs, limitS },
      atMs: first?.startMs,
    });
  }

  if (m.articulationRate > hi + 0.5) {
    tips.push({
      key: 'too_fast',
      severity: m.articulationRate > hi + 1 ? 'bad' : 'warn',
      params: { rate: m.articulationRate, lo, hi },
    });
  } else if (m.articulationRate < lo - 1 && m.syllables > 0) {
    tips.push({ key: 'too_slow', severity: 'info', params: { rate: m.articulationRate, lo, hi } });
  }

  if (rated.length >= 3 && m.fastPhrases / rated.length >= T.fastPhraseShare && !tips.some((t) => t.key === 'too_fast')) {
    const first = rated.find((p) => p.tempo === 'fast' || p.tempo === 'too_fast');
    tips.push({
      key: 'speeding_up',
      severity: 'warn',
      params: { fast: m.fastPhrases, rated: rated.length, hi },
      atMs: first?.startMs,
    });
  }

  if (m.snrDb < T.snrWarnDb) {
    tips.push({ key: 'noise', severity: 'info' });
  }

  if (!tips.some((t) => t.severity === 'bad' || t.severity === 'warn')) {
    tips.unshift({ key: 'all_ok', severity: 'ok' });
  }
  return tips;
}
