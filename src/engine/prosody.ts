import type { Flag, RawWord } from '@/types';
import { T } from './thresholds';
import { frameRange, isFillerToken, mkFlag } from './context';
import { median, percentile } from './features';
import { hzToSemitones } from './pitch';
import { wordSyllableTimes } from './tempo';

export interface SyllableIntensity {
  tMs: number;
  db: number;
  wordIndex: number;
}

export interface ProsodyResult {
  flags: Flag[];
  f0MedianHz: number;
  f0RangeSemitones: number;
  syllables: SyllableIntensity[];
  sentences: number;
  swallowedSentences: number;
  volumeSlopeDbPerMin: number;
  volumeDecline: boolean;
  medianIntensityDb: number;
}

/** Peak of the intensity envelope around a syllable nucleus. */
function peakDb(db: ArrayLike<number>, tMs: number) {
  const vals = frameRange(db, tMs - 40, tMs + 40);
  return vals.length ? Math.max(...vals) : -100;
}

function slope(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den > 0 ? num / den : 0;
}

export function analyzeProsody(
  words: RawWord[],
  feats: { db: ArrayLike<number>; f0: ArrayLike<number> },
  speechFrames: (i: number) => boolean,
  articulationFlaggedWords: Set<number>,
  opts: { reading: boolean; durationMs: number; asrAvailable: boolean },
): ProsodyResult {
  const flags: Flag[] = [];

  // F0 over speech frames (semitones relative to the median).
  const f0: number[] = [];
  for (let i = 0; i < feats.f0.length; i++) if (feats.f0[i] > 0 && speechFrames(i)) f0.push(feats.f0[i]);
  const f0Med = f0.length ? median(f0) : 0;
  const st = f0.map((x) => hzToSemitones(x, f0Med));
  const range = st.length >= 50 ? percentile(st, 90) - percentile(st, 10) : NaN;
  if (Number.isFinite(range) && range < T.monotoneSemitones && f0.length >= 300) {
    flags.push(mkFlag('MONOTONE', 'amber', 'medium', 0, opts.durationMs,
      `Monotonna intonacja – rozpiętość tonu ${range.toFixed(1)} półtonu (cel ≥ ${T.monotoneSemitones})`, { details: { rangeSt: +range.toFixed(2) } }));
  }

  // Syllable intensities (aligned syllables).
  const syl: SyllableIntensity[] = [];
  words.forEach((w, wi) => {
    if (isFillerToken(w.text)) return;
    for (const t of wordSyllableTimes(w)) syl.push({ tMs: t, db: peakDb(feats.db, t), wordIndex: wi });
  });
  syl.sort((a, b) => a.tMs - b.tMs);

  // Sentence endings (5.10).
  let sentences = 0;
  let swallowed = 0;
  let sentenceStart = 0;
  words.forEach((w, wi) => {
    const last = wi === words.length - 1;
    if (w.boundary !== 'sentence' && !last) return;
    const range = [sentenceStart, wi];
    sentenceStart = wi + 1;
    const ss = syl.filter((s) => s.wordIndex >= range[0] && s.wordIndex <= range[1]);
    if (ss.length < T.sentenceMinSyl) return;
    sentences++;
    const med = median(ss.map((s) => s.db));
    const lastTwo = ss.slice(-2);
    const endDb = (lastTwo[0].db + lastTwo[1].db) / 2;
    const drop = med - endDb;
    const lastFlagged = articulationFlaggedWords.has(wi);
    const conf = opts.reading ? 'high' : 'medium';
    if (drop > T.sentenceEndRedDb && (lastFlagged || drop > T.sentenceEndStrongDb)) {
      swallowed++;
      flags.push(mkFlag('SWALLOWED_SENTENCE_ENDING', 'red', conf, lastTwo[0].tMs - 80, w.endMs + 100,
        `Połknięty koniec zdania – ostatnie sylaby ciszej o ${drop.toFixed(0)} dB`, { wordIndex: wi, details: { dropDb: +drop.toFixed(1) } }));
    } else if (drop >= T.sentenceEndAmberDb) {
      swallowed += 0.5;
      flags.push(mkFlag('SWALLOWED_SENTENCE_ENDING', 'amber', 'medium', lastTwo[0].tMs - 80, w.endMs + 100,
        `Cichnący koniec zdania – ostatnie sylaby ciszej o ${drop.toFixed(0)} dB`, { wordIndex: wi, details: { dropDb: +drop.toFixed(1) } }));
    }
  });

  // Volume trend over the answer.
  const s = slope(syl.map((x) => x.tMs / 60000), syl.map((x) => x.db));
  const decline = opts.durationMs >= T.volumeDeclineMinMs && syl.length >= 20 && s < T.volumeDeclineDbPerMin;
  if (decline) {
    flags.push(mkFlag('VOLUME_DECLINE', 'amber', 'medium', syl[Math.floor(syl.length / 2)].tMs, opts.durationMs,
      `Cichniesz z czasem (${s.toFixed(1)} dB/min)`, { details: { slope: +s.toFixed(1) } }));
  }

  const speechDb: number[] = [];
  for (let i = 0; i < feats.db.length; i++) if (speechFrames(i)) speechDb.push(feats.db[i]);

  return {
    flags,
    f0MedianHz: f0Med,
    f0RangeSemitones: Number.isFinite(range) ? range : 0,
    syllables: syl,
    sentences,
    swallowedSentences: swallowed,
    volumeSlopeDbPerMin: s,
    volumeDecline: decline,
    medianIntensityDb: speechDb.length ? median(speechDb) : -100,
  };
}
