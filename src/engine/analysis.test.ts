import { describe, expect, it } from 'vitest';
import { alignWordSeq } from './wordDiff';
import { planChunksOffline, vadSegments, mergeSegments } from './segmentation';
import { yinTrack } from './pitch';
import { extractFeatures, SR } from './features';
import { detectNuclei } from './syllableNuclei';
import { mfccDeltaTrack } from './mfcc';
import { articulationScore, fluencyScore, prosodyScore, tempoScore, totalScore } from './scoring';
import { buildPacerSchedule, comparePacer } from './pacer';
import { normalizeText } from './normalize';
import { analyzeSession } from './report';
import type { AnalysisInput } from './context';
import type { AlignedChar, RawWord } from '@/types';
import { DEFAULT_SCORE_WEIGHTS } from './thresholds';

function tone(sec: number, f: number, amp: (t: number) => number = () => 0.3): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    // a few harmonics so the signal is voiced-speech-like
    x[i] = amp(t) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)) / 1.75;
  }
  return x;
}

describe('wordDiff', () => {
  it('detects skipped and inserted words', () => {
    const { ops } = alignWordSeq(['ala', 'ma', 'małego', 'kota'], ['ala', 'ma', 'kota', 'no']);
    expect(ops.filter((o) => o.op === 'del').map((o) => (o as { ref: number }).ref)).toEqual([2]);
    expect(ops.filter((o) => o.op === 'ins').length).toBe(1);
  });
  it('treats near spellings as matches and leaves the reference tail free', () => {
    const r = alignWordSeq(['zrobiłem', 'to', 'wczoraj', 'rano', 'i', 'potem'], ['zrobilem', 'to', 'wczoraj'], true);
    expect(r.refConsumed).toBe(3);
    expect(r.ops.every((o) => o.op === 'match')).toBe(true);
  });
});

describe('segmentation', () => {
  it('applies VAD hysteresis', () => {
    const p = [0.1, 0.6, 0.45, 0.4, 0.3, 0.2, 0.9, 0.9];
    expect(vadSegments(p, 10)).toEqual([{ startMs: 10, endMs: 40 }, { startMs: 60, endMs: 80 }]);
  });
  it('cuts chunks after long pauses and skips tiny ones', () => {
    const segs = [{ startMs: 0, endMs: 2000 }, { startMs: 3000, endMs: 3200 }, { startMs: 4500, endMs: 7000 }];
    const chunks = planChunksOffline(segs, 8000);
    expect(chunks[0]).toMatchObject({ startMs: 0, endMs: 2200, skip: false });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[chunks.length - 1].endMs).toBe(7200);
  });
  it('forces a cut at 25 s', () => {
    const chunks = planChunksOffline([{ startMs: 0, endMs: 40000 }], 40000);
    expect(chunks[0].endMs).toBe(25000);
    expect(chunks[1].startMs).toBe(25000);
  });
  it('merges segments', () => {
    expect(mergeSegments([{ startMs: 0, endMs: 100 }, { startMs: 200, endMs: 300 }], 250)).toEqual([{ startMs: 0, endMs: 300 }]);
  });
});

describe('acoustics', () => {
  it('YIN tracks a 200 Hz tone', () => {
    const f0 = yinTrack(tone(0.5, 200));
    const voiced = Array.from(f0).filter((x) => x > 0);
    expect(voiced.length).toBeGreaterThan(30);
    const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length;
    expect(mean).toBeGreaterThan(195);
    expect(mean).toBeLessThan(205);
  });

  it('counts syllable nuclei on a 5 Hz modulated tone', () => {
    const x = tone(2, 150, (t) => 0.02 + 0.3 * Math.abs(Math.sin(Math.PI * 5 * t)) ** 2);
    const f = extractFeatures(x);
    const n = detectNuclei(f.db, f.voicing, -60);
    expect(n.length).toBeGreaterThanOrEqual(9);
    expect(n.length).toBeLessThanOrEqual(11);
  });

  it('MFCC delta is low for a steady vowel and high for noise', () => {
    const steady = mfccDeltaTrack(tone(0.5, 150));
    const noise = new Float32Array(SR / 2);
    let s = 1;
    for (let i = 0; i < noise.length; i++) { s = (s * 16807) % 2147483647; noise[i] = (s / 2147483647 - 0.5) * (i % 1600 < 800 ? 0.6 : 0.05); }
    const nd = mfccDeltaTrack(noise);
    const mean = (a: Float32Array) => Array.from(a.slice(5, -5)).reduce((p, c) => p + c, 0) / (a.length - 10);
    expect(mean(steady)).toBeLessThan(mean(nd));
    expect(mean(steady)).toBeLessThan(1);
  });
});

describe('scoring formulas', () => {
  it('tempo', () => {
    expect(tempoScore({ ar: 5, arRange: [4.5, 5.5], rushedIpuRatio: 0 }).score).toBe(100);
    expect(tempoScore({ ar: 6.5, arRange: [4.5, 5.5], rushedIpuRatio: 0 }).score).toBe(50);
    expect(tempoScore({ ar: 7.5, arRange: [4.5, 5.5], rushedIpuRatio: 0 }).score).toBe(0);
    expect(tempoScore({ ar: 5, arRange: [4.5, 5.5], rushedIpuRatio: 0.5 }).score).toBe(85);
    expect(tempoScore({ ar: 5, arRange: [4.5, 5.5], rushedIpuRatio: 0, pacerMeanAbsDevMs: 200 }).score).toBe(80);
  });
  it('articulation', () => {
    expect(articulationScore({ MUMBLED_WORD: 1, SUBSTITUTED_SOUND: 0.5 }, 20).score).toBeCloseTo(85);
    expect(articulationScore({ MUMBLED_WORD: 20 }, 20).score).toBe(0);
  });
  it('fluency', () => {
    const s = fluencyScore({ minutes: 1, fillers: 2, noBreathRatio: 0, missingPauseRatio: 0.5, hesitations: 1, repetitions: 1 });
    expect(s.score).toBeCloseTo(100 - 16 - 15 - 5 - 3);
  });
  it('prosody & total', () => {
    expect(prosodyScore({ swallowedRatio: 0, f0RangeSt: 5, volumeDecline: false, lowSnr: false }).score).toBe(100);
    expect(prosodyScore({ swallowedRatio: 0, f0RangeSt: 3, volumeDecline: true, lowSnr: false }).score).toBeCloseTo(50 + 15 + 10);
    expect(totalScore({ tempo: 100, articulation: 0, fluency: 100, prosody: 100 }, DEFAULT_SCORE_WEIGHTS)).toBeCloseTo(65);
  });
});

describe('pacer', () => {
  it('schedules by syllables with punctuation pauses', () => {
    const p = buildPacerSchedule(normalizeText('Ala ma kota. Kot'), 4, 0, 1000);
    expect(p.schedule[0]).toEqual({ wordIndex: 0, startMs: 1000, endMs: 1500 });
    expect(p.schedule[3].startMs).toBe(1000 + 500 + 250 + 500 + 1200);
  });
  it('merges consecutive deviations into one flag', () => {
    const p = buildPacerSchedule(normalizeText('raz dwa trzy cztery pięć'), 4, 0, 0);
    const words: RawWord[] = p.schedule.map((s, i) => ({
      text: 'x', op: 'match', targetIndex: i, startMs: s.startMs + (i >= 2 ? 800 : 0), endMs: s.endMs + 900, alignScore: 0, chars: null, unscorable: false,
    }));
    const r = comparePacer(words, p);
    expect(r.flags.length).toBe(1);
    expect(r.flags[0].type).toBe('BEHIND_PACER');
  });
});

describe('analyzeSession', () => {
  const ch = (c: string, t: number, p = 0.95): AlignedChar => ({
    char: c, startMs: t, endMs: t + 20, pTarget: p, competitor: 'a', pComp: 0.01, gop: Math.log(p / 0.01), segBest: c, segBestP: p,
  });
  const mkWord = (text: string, start: number, msPerChar: number, extra: Partial<RawWord> = {}): RawWord => {
    const chars = [...text].map((c, k) => ch(c, start + k * msPerChar));
    return { text, op: 'match', startMs: start, endMs: start + text.length * msPerChar, alignScore: -0.3, chars, unscorable: false, ...extra };
  };

  function input(words: RawWord[], speech: { startMs: number; endMs: number }[], durationMs: number): AnalysisInput {
    const n = durationMs / 10;
    const db = new Float32Array(n).fill(-70);
    const voicing = new Float32Array(n);
    const f0 = new Float32Array(n);
    for (const s of speech) for (let i = s.startMs / 10; i < s.endMs / 10; i++) { db[i] = -25 + 3 * Math.sin(i / 3); voicing[i] = 0.8; f0[i] = 120 + 25 * Math.sin(i / 40); }
    return {
      mode: 'free_reading', reading: true, durationMs, speech, db, voicing, f0, mfccDelta: new Float32Array(n).fill(3), noiseFloorDb: -70,
      words, skipped: [], asrAvailable: true, gopAvailable: true, liveNuclei: 0,
      settings: { targetArticulationRate: [4.5, 5.5], maxContinuousSpeechSeconds: 8, scoreWeights: DEFAULT_SCORE_WEIGHTS, liveSyllableCorrection: 1 },
      baseline: null,
    };
  }

  it('scores a clean reading highly', () => {
    // "dzień dobry wszystkim. miło mi" ~ 9 syllables in 1.8 s → 5 syl/s
    const w = [
      mkWord('dzień', 0, 40), mkWord('dobry', 200, 60), mkWord('wszystkim', 500, 50, { boundary: 'sentence' }),
      mkWord('miło', 1450, 80), mkWord('mi', 1800, 100),
    ];
    const r = analyzeSession(input(w, [{ startMs: 0, endMs: 950 }, { startMs: 1400, endMs: 2000 }], 2500));
    expect(r.flags.filter((f) => f.severity === 'red')).toEqual([]);
    expect(r.scores.articulation).toBe(100);
    expect(r.metrics.articulationRate).toBeGreaterThan(5);
    expect(r.scores.total).toBeGreaterThan(80);
  });

  it('flags a swallowed ending, missing pause and skipped word', () => {
    const bad = mkWord('zrobiłem', 0, 60, { boundary: 'sentence' });
    bad.chars![6] = { ...bad.chars![6], pTarget: 0.01, gop: -4, segBest: 'a', segBestP: 0.02 };
    bad.chars![7] = { ...bad.chars![7], pTarget: 0.01, gop: -4, segBest: 'a', segBestP: 0.02 };
    const w = [bad, mkWord('potem', 520, 60)];
    const inp = input(w, [{ startMs: 0, endMs: 850 }], 1000);
    inp.skipped = [{ targetText: 'wszystko', targetIndex: 2, atMs: 900 }];
    const r = analyzeSession(inp);
    const types = r.flags.map((f) => f.type);
    expect(types).toContain('SWALLOWED_WORD_ENDING');
    expect(types).toContain('MISSING_PAUSE');
    expect(types).toContain('SKIPPED_WORD');
    expect(r.words.map((x) => x.status)).toEqual(['mumbled', 'ok', 'skipped']);
    expect(r.topIssues.length).toBeGreaterThan(0);
    const f = r.flags.find((x) => x.type === 'SWALLOWED_WORD_ENDING')!;
    expect(r.words[f.wordIndex!].flagIndices).toContain(r.flags.indexOf(f));
  });

  it('detects an acoustic filler between words', () => {
    const w = [mkWord('dobrze', 0, 60), mkWord('potem', 1000, 60)];
    const inp = input(w, [{ startMs: 0, endMs: 1400 }], 1500);
    const f0 = inp.f0 as Float32Array;
    const md = inp.mfccDelta as Float32Array;
    for (let i = 40; i < 95; i++) { f0[i] = 110; md[i] = 0.3; }
    const r = analyzeSession(inp);
    expect(r.flags.some((f) => f.type === 'FILLER_SOUND' || f.type === 'PROLONGATION')).toBe(true);
  });

  it('degrades gracefully without ASR', () => {
    const inp = input([], [{ startMs: 0, endMs: 3000 }], 3500);
    inp.asrAvailable = false;
    inp.gopAvailable = false;
    const r = analyzeSession(inp);
    expect(r.analysisStatus).toBe('pending');
    expect(r.scores.articulation).toBe(-1);
    expect(Number.isFinite(r.scores.total)).toBe(true);
  });
});
