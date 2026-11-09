import type { Flag, PhraseAnalysis, RawWord, SpeechSegment } from '@/types';
import { T } from './thresholds';
import { mergeSegments } from './segmentation';
import { countSyllables, syllableNuclei } from './syllables';
import { isFillerToken, mkFlag } from './context';

export interface Ipu extends SpeechSegment {
  syllables: number;
  wordIdx: number[];
}

const wordMid = (w: RawWord) => (w.startMs + w.endMs) / 2;

/** IPUs = speech separated by pauses ≥250 ms; syllables from aligned words or (fallback) from live nuclei. */
export function buildIpus(speech: SpeechSegment[], words: RawWord[], nucleiMs: number[] | null, correction = 1): Ipu[] {
  const ipus = mergeSegments(speech, T.pauseMinMs).map((s) => ({ ...s, syllables: 0, wordIdx: [] as number[] }));
  if (words.length) {
    words.forEach((w, i) => {
      if (isFillerToken(w.text)) return;
      const m = wordMid(w);
      let best = -1;
      let bestDist = Infinity;
      ipus.forEach((p, k) => {
        const d = m < p.startMs ? p.startMs - m : m > p.endMs ? m - p.endMs : 0;
        if (d < bestDist) { bestDist = d; best = k; }
      });
      if (best >= 0) {
        ipus[best].wordIdx.push(i);
        ipus[best].syllables += countSyllables(w.text);
      }
    });
  } else if (nucleiMs) {
    for (const t of nucleiMs) {
      const p = ipus.find((x) => t >= x.startMs - 50 && t <= x.endMs + 50);
      if (p) p.syllables += correction;
    }
    ipus.forEach((p) => (p.syllables = Math.round(p.syllables)));
  }
  return ipus;
}

export function phrasesFromIpus(ipus: Ipu[]): PhraseAnalysis[] {
  return ipus.map((p, i) => {
    const dur = (p.endMs - p.startMs) / 1000;
    return {
      startMs: p.startMs,
      endMs: p.endMs,
      syllables: p.syllables,
      articulationRate: dur > 0 ? p.syllables / dur : 0,
      pauseAfterMs: i + 1 < ipus.length ? ipus[i + 1].startMs - p.endMs : 0,
    };
  });
}

export interface TempoResult {
  speechRate: number;
  articulationRate: number;
  wpm: number;
  totalSyllables: number;
  flags: Flag[];
  rushedIpus: Set<number>;
  ipuFlagRatio: number;
}

/** Syllable nucleus times inside a word (vowel character spikes). */
export function wordSyllableTimes(w: RawWord): number[] {
  const nuclei = syllableNuclei(w.text);
  if (w.chars) return nuclei.map((i) => (w.chars![i] ? (w.chars![i].startMs + w.chars![i].endMs) / 2 : wordMid(w)));
  const n = nuclei.length;
  return nuclei.map((_, k) => w.startMs + ((k + 0.5) * (w.endMs - w.startMs)) / Math.max(1, n));
}

export function analyzeTempo(
  ipus: Ipu[],
  words: RawWord[],
  baselineAR: number,
  confidence: 'high' | 'medium',
): TempoResult {
  const flags: Flag[] = [];
  const rushed = new Set<number>();
  const totalSyl = ipus.reduce((s, p) => s + p.syllables, 0);
  const speechSec = ipus.reduce((s, p) => s + (p.endMs - p.startMs), 0) / 1000;
  const spanStart = Math.min(ipus[0]?.startMs ?? 0, words[0]?.startMs ?? Infinity);
  const spanEnd = Math.max(ipus[ipus.length - 1]?.endMs ?? 0, words[words.length - 1]?.endMs ?? 0);
  const spanSec = Math.max(0.001, (spanEnd - spanStart) / 1000);
  const realWords = words.filter((w) => !isFillerToken(w.text));

  ipus.forEach((p, k) => {
    const dur = (p.endMs - p.startMs) / 1000;
    const ar = dur > 0 ? p.syllables / dur : 0;
    const limit = Math.max(T.rushedPhraseAbs, T.rushedPhraseRel * baselineAR);
    if (p.syllables >= T.rushedPhraseMinSyl && ar > limit) {
      rushed.add(k);
      flags.push(mkFlag('RUSHED_PHRASE', 'red', confidence, p.startMs, p.endMs,
        `Za szybka fraza: ${ar.toFixed(1)} sylaby/s (limit ${limit.toFixed(1)})`, { details: { ar: +ar.toFixed(2), limit: +limit.toFixed(2) } }));
    }
    // Acceleration within a long IPU: compare AR of the second half with the first.
    if (p.endMs - p.startMs >= T.accelMinIpuMs && p.wordIdx.length) {
      const mid = (p.startMs + p.endMs) / 2;
      const times = p.wordIdx.flatMap((i) => wordSyllableTimes(words[i]));
      const a = times.filter((t) => t < mid).length;
      const b = times.filter((t) => t >= mid).length;
      const halfSec = (p.endMs - p.startMs) / 2000;
      if (a >= 4 && b >= 4 && b / halfSec > T.accelRatio * (a / halfSec)) {
        rushed.add(k);
        flags.push(mkFlag('ACCELERATING_PHRASE', 'amber', confidence, mid, p.endMs,
          `Przyspieszasz pod koniec frazy (${(a / halfSec).toFixed(1)} → ${(b / halfSec).toFixed(1)} sylaby/s)`,
          { details: { first: +(a / halfSec).toFixed(2), second: +(b / halfSec).toFixed(2) } }));
      }
    }
  });

  // Rushed words: duration until the next word (or end of the IPU), since CTC spikes end early.
  words.forEach((w, i) => {
    if (isFillerToken(w.text) || w.timingApprox) return;
    const syl = countSyllables(w.text);
    if (syl < T.rushedWordMinSyl) return;
    const ipu = ipus.find((p) => wordMid(w) >= p.startMs - 50 && wordMid(w) <= p.endMs + 50);
    const next = words[i + 1];
    let end = ipu ? ipu.endMs : w.endMs + 100;
    if (next && next.startMs < end) end = next.startMs;
    const dur = (end - w.startMs) / 1000;
    if (dur <= 0) return;
    const rate = syl / dur;
    if (rate > T.rushedWordRate) {
      flags.push(mkFlag('RUSHED_WORD', 'amber', 'medium', w.startMs, end,
        `„${w.text}”: ${syl} sylaby w ${dur.toFixed(2)} s – za szybko`, { wordIndex: i, details: { rate: +rate.toFixed(1) } }));
    }
  });

  return {
    speechRate: totalSyl / spanSec,
    articulationRate: speechSec > 0 ? totalSyl / speechSec : 0,
    wpm: (realWords.length / spanSec) * 60,
    totalSyllables: totalSyl,
    flags,
    rushedIpus: rushed,
    ipuFlagRatio: ipus.length ? rushed.size / ipus.length : 0,
  };
}
