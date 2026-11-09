import type { Flag, PauseInfo, RawWord, SpeechSegment } from '@/types';
import { T } from './thresholds';
import { mergeSegments } from './segmentation';
import { isFillerToken, mkFlag } from './context';
import type { Ipu } from './tempo';

/** Silence gaps (complement of VAD speech) inside the recording. */
export function silenceGaps(speech: SpeechSegment[]): SpeechSegment[] {
  const gaps: SpeechSegment[] = [];
  for (let i = 0; i + 1 < speech.length; i++) gaps.push({ startMs: speech[i].endMs, endMs: speech[i + 1].startMs });
  return gaps;
}

/** Longest VAD silence between two words (CTC word ends are early, so the window is padded). */
export function silenceBetween(gaps: SpeechSegment[], aMs: number, bMs: number): number {
  let best = 0;
  for (const g of gaps) {
    if (g.endMs < aMs - 100 || g.startMs > bMs + 150) continue;
    best = Math.max(best, g.endMs - g.startMs);
  }
  return best;
}

export interface PauseResult {
  pauses: PauseInfo[];
  flags: Flag[];
  breathRuns: SpeechSegment[];
  noBreathRatio: number;
  sentenceBoundaries: number;
  missingSentencePauses: number;
  hesitations: number;
  longestIpuMs: number;
  meanPauseMs: number;
}

export function analyzePauses(
  speech: SpeechSegment[],
  ipus: Ipu[],
  words: RawWord[],
  opts: { reading: boolean; maxContinuousMs: number; asrAvailable: boolean },
): PauseResult {
  const flags: Flag[] = [];
  const gaps = silenceGaps(speech);
  const real = words.map((w, i) => ({ w, i })).filter(({ w }) => !isFillerToken(w.text));

  // Breath runs: continuous speech without a ≥350 ms pause (4.2).
  const runs = mergeSegments(speech, T.breathPauseMs);
  let over = 0;
  for (const r of runs) {
    const len = r.endMs - r.startMs;
    if (len > opts.maxContinuousMs) {
      over++;
      flags.push(mkFlag('NO_BREATH', 'red', 'high', r.startMs + opts.maxContinuousMs, r.endMs,
        `Brak przerwy oddechowej przez ${(len / 1000).toFixed(1)} s (limit ${(opts.maxContinuousMs / 1000).toFixed(0)} s)`,
        { details: { runMs: Math.round(len) } }));
    }
  }

  // Pauses between IPUs.
  const pauses: PauseInfo[] = [];
  let hes = 0;
  for (let k = 0; k + 1 < ipus.length; k++) {
    const startMs = ipus[k].endMs;
    const endMs = ipus[k + 1].startMs;
    const len = endMs - startMs;
    if (len < T.pauseMinMs) continue;
    const before = real.filter(({ w }) => w.startMs < startMs + 100).pop();
    const atBoundary = before?.w.boundary;
    let kind: PauseInfo['kind'] = len > T.longPauseMs ? 'long' : 'normal';
    if (len > T.hesitationPauseMs && opts.asrAvailable && atBoundary !== 'sentence') {
      kind = 'hesitation';
      hes++;
      flags.push(mkFlag('HESITATION_PAUSE', 'amber', 'medium', startMs, endMs,
        `Pauza wahania ${(len / 1000).toFixed(1)} s w środku wypowiedzi`, { wordIndex: before?.i, details: { pauseMs: Math.round(len) } }));
    }
    pauses.push({ startMs, endMs, kind, atBoundary });
  }

  // Punctuation-driven pause checks (5.9).
  let sentenceBoundaries = 0;
  let missingSentence = 0;
  for (let k = 0; k + 1 < real.length; k++) {
    const { w, i } = real[k];
    const next = real[k + 1].w;
    const sil = silenceBetween(gaps, w.endMs, next.startMs);
    const sev = opts.reading ? 'red' : 'amber';
    const conf = opts.reading ? 'high' : 'medium';
    if (w.boundary === 'sentence') {
      sentenceBoundaries++;
      if (sil < T.missingSentencePauseMs) {
        missingSentence++;
        flags.push(mkFlag('MISSING_PAUSE', sev, conf, w.endMs, next.startMs,
          `Brak pauzy po końcu zdania („${w.text}.”) – ${Math.round(sil)} ms`, { wordIndex: i, details: { pauseMs: Math.round(sil), boundary: 'sentence' } }));
      }
    } else if (w.boundary === 'comma') {
      if (sil < T.missingCommaPauseMs) {
        flags.push(mkFlag('MISSING_PAUSE', 'amber', conf, w.endMs, next.startMs,
          `Brak krótkiej pauzy po przecinku („${w.text},”)`, { wordIndex: i, details: { pauseMs: Math.round(sil), boundary: 'comma' } }));
      }
    } else if (sil > T.unexpectedPauseMs && sil <= T.hesitationPauseMs) {
      flags.push(mkFlag('UNEXPECTED_PAUSE', 'amber', 'medium', w.endMs, next.startMs,
        `Nieoczekiwana pauza (${(sil / 1000).toFixed(1)} s) w środku frazy, po „${w.text}”`, { wordIndex: i, details: { pauseMs: Math.round(sil) } }));
    }
  }

  const pauseLens = pauses.map((p) => p.endMs - p.startMs);
  return {
    pauses,
    flags,
    breathRuns: runs,
    noBreathRatio: runs.length ? over / runs.length : 0,
    sentenceBoundaries,
    missingSentencePauses: missingSentence,
    hesitations: hes,
    longestIpuMs: runs.reduce((m, r) => Math.max(m, r.endMs - r.startMs), 0),
    meanPauseMs: pauseLens.length ? pauseLens.reduce((a, b) => a + b, 0) / pauseLens.length : 0,
  };
}
