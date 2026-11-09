import type { Flag, RawWord, SpeechSegment } from '@/types';
import { T } from './thresholds';
import { frameRange, isFillerToken, mkFlag } from './context';
import { hzToSemitones } from './pitch';
import { median } from './features';
import type { Ipu } from './tempo';

const LEXICAL_FILLERS: string[][] = [
  ['jakby'], ['generalnie'], ['w', 'sumie'], ['tak', 'naprawdę'], ['po', 'prostu'], ['wiesz'], ['znaczy'],
  ['no'],
];

export interface FillerResult {
  flags: Flag[];
  fillerWordIdx: Set<number>;
  fillerSounds: number;
  fillerWords: number;
  repetitions: number;
}

function stats(values: number[]) {
  const m = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, values.length));
  return { m, sd };
}

/** Voiced, pitch-stable, spectrally stable span → sustained "yyy/eee/mmm" or a prolonged vowel. */
function isSustainedVoiced(startMs: number, endMs: number, voicing: ArrayLike<number>, f0: ArrayLike<number>, mfccDelta: ArrayLike<number>) {
  const v = frameRange(voicing, startMs, endMs);
  if (!v.length) return false;
  const voicedRatio = v.filter((x) => x > T.nucleusVoicing).length / v.length;
  if (voicedRatio < T.fillerVoicedRatio) return false;
  const f = frameRange(f0, startMs, endMs).filter((x) => x > 0);
  if (f.length < 5) return false;
  const ref = median(f);
  const { sd } = stats(f.map((x) => hzToSemitones(x, ref)));
  if (sd >= T.fillerF0SdSemitones) return false;
  const d = frameRange(mfccDelta, startMs, endMs);
  const { m } = stats(d);
  return m < T.fillerMfccDelta;
}

export function detectFillers(
  speech: SpeechSegment[],
  ipus: Ipu[],
  words: RawWord[],
  feats: { voicing: ArrayLike<number>; f0: ArrayLike<number>; mfccDelta: ArrayLike<number> },
  durationMs: number,
): FillerResult {
  const flags: Flag[] = [];
  const fillerIdx = new Set<number>();
  let sounds = 0;
  let repetitions = 0;

  // 1) Whisper-emitted filler tokens.
  words.forEach((w, i) => {
    if (isFillerToken(w.text)) {
      fillerIdx.add(i);
      sounds++;
      flags.push(mkFlag('FILLER_SOUND', 'amber', 'medium', w.startMs, w.endMs, `Wypełniacz „${w.text}”`, { wordIndex: i }));
    }
  });

  // 2) Acoustic fillers: speech not covered by any aligned word.
  const covered = words.filter((w) => !isFillerToken(w.text)).map((w) => ({ s: w.startMs - 60, e: w.endMs + 60, w }));
  for (const seg of speech) {
    let pieces: SpeechSegment[] = [{ ...seg }];
    for (const c of covered) {
      pieces = pieces.flatMap((p) => {
        if (c.e <= p.startMs || c.s >= p.endMs) return [p];
        const out: SpeechSegment[] = [];
        if (c.s > p.startMs) out.push({ startMs: p.startMs, endMs: c.s });
        if (c.e < p.endMs) out.push({ startMs: c.e, endMs: p.endMs });
        return out;
      });
    }
    for (const p of pieces) {
      const len = p.endMs - p.startMs;
      if (len < T.fillerMinMs) continue;
      const prevWordIdx = covered.findIndex((c) => Math.abs(c.e - p.startMs) < 20);
      // A sustained sound glued to a word ending in a continuable sound (vowel/sonorant) is a prolongation ("żeeee").
      const lastChar = prevWordIdx >= 0 ? covered[prevWordIdx].w.text.slice(-1) : '';
      const isProlongation = prevWordIdx >= 0 && len >= T.prolongationMs - 60 && len < 1000 && /[aąeęioóuylłmnńrjw]/.test(lastChar);
      if (!isSustainedVoiced(p.startMs, p.endMs, feats.voicing, feats.f0, feats.mfccDelta)) continue;
      if (isProlongation) {
        const w = covered[prevWordIdx].w;
        flags.push(mkFlag('PROLONGATION', 'amber', 'medium', w.endMs, p.endMs,
          `Przeciągnięta końcówka „${w.text}” (${Math.round(len + 60)} ms)`, { wordIndex: words.indexOf(w) }));
      } else if (words.length) {
        sounds++;
        flags.push(mkFlag('FILLER_SOUND', 'amber', 'medium', p.startMs, p.endMs,
          `Wypełniacz dźwiękowy („yyy/eee”) – ${(len / 1000).toFixed(1)} s`, { details: { durationMs: Math.round(len) } }));
      }
    }
  }

  // 3) Lexical fillers.
  const minutes = Math.max(durationMs / 60000, 0.25);
  const ipuStarts = new Set(ipus.map((p) => p.wordIdx[0]).filter((x) => x !== undefined));
  const ipuEnds = new Set(ipus.map((p) => p.wordIdx[p.wordIdx.length - 1]).filter((x) => x !== undefined));
  const occurrences = new Map<string, number[]>();
  for (let i = 0; i < words.length; i++) {
    for (const f of LEXICAL_FILLERS) {
      if (f.every((t, k) => words[i + k]?.text === t)) {
        if (f[0] === 'no' && f.length === 1 && !ipuStarts.has(i) && !ipuEnds.has(i)) continue;
        const key = f.join(' ');
        occurrences.set(key, [...(occurrences.get(key) ?? []), i]);
      }
    }
  }
  let lexical = 0;
  for (const [key, idx] of occurrences) {
    const perMin = idx.length / minutes;
    if (idx.length >= 2 && perMin > T.fillerWordPerMin) {
      lexical += idx.length;
      for (const i of idx) {
        fillerIdx.add(i);
        flags.push(mkFlag('FILLER_WORD', 'amber', 'medium', words[i].startMs, words[i + key.split(' ').length - 1].endMs,
          `Wypełniacz „${key}” (${perMin.toFixed(1)}/min)`, { wordIndex: i, details: { perMinute: +perMin.toFixed(1) } }));
      }
    }
  }

  // 4) Repetitions: "to to", "i i", restarted phrases ("i to jest i to jest").
  const tx = words.map((w) => w.text);
  for (let i = 1; i < tx.length; i++) {
    if (isFillerToken(tx[i])) continue;
    let found = 0;
    for (let n = 3; n >= 1; n--) {
      if (i - n < 0 || i + n > tx.length) continue;
      const a = tx.slice(i - n, i).join(' ');
      const b = tx.slice(i, i + n).join(' ');
      if (a === b && !(n === 1 && tx[i].length > 4)) { found = n; break; }
    }
    if (found) {
      repetitions++;
      flags.push(mkFlag('REPETITION', 'amber', 'medium', words[i - found].startMs, words[i + found - 1].endMs,
        `Powtórzenie: „${tx.slice(i, i + found).join(' ')}”`, { wordIndex: i }));
      i += found - 1;
    }
  }

  return { flags, fillerWordIdx: fillerIdx, fillerSounds: sounds, fillerWords: lexical, repetitions };
}
