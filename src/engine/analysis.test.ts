import { describe, expect, it } from 'vitest';
import { vadSegments, mergeSegments } from './segmentation';
import { extractFeatures, SR } from './features';
import { detectNuclei } from './syllableNuclei';
import { analyzeSession, classifyTempo, type SessionAnalysisInput } from './session';

function tone(sec: number, f: number, amp: (t: number) => number = () => 0.3): Float32Array {
  const x = new Float32Array(Math.round(sec * SR));
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] = amp(t) * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)) / 1.75;
  }
  return x;
}

describe('segmentation', () => {
  it('applies VAD hysteresis', () => {
    const p = [0.1, 0.6, 0.45, 0.4, 0.3, 0.2, 0.9, 0.9];
    expect(vadSegments(p, 10)).toEqual([{ startMs: 10, endMs: 40 }, { startMs: 60, endMs: 80 }]);
  });
  it('merges segments', () => {
    expect(mergeSegments([{ startMs: 0, endMs: 100 }, { startMs: 200, endMs: 300 }], 250)).toEqual([{ startMs: 0, endMs: 300 }]);
  });
});

describe('acoustics', () => {
  it('counts syllable nuclei on a 5 Hz modulated tone', () => {
    const x = tone(2, 150, (t) => 0.02 + 0.3 * Math.abs(Math.sin(Math.PI * 5 * t)) ** 2);
    const f = extractFeatures(x);
    const n = detectNuclei(f.db, f.voicing, -60);
    expect(n.length).toBeGreaterThanOrEqual(9);
    expect(n.length).toBeLessThanOrEqual(11);
  });
});

/** Nuclei every `1000/rate` ms inside [start, end). */
function nuclei(start: number, end: number, rate: number): number[] {
  const out: number[] = [];
  for (let t = start + 50; t < end; t += 1000 / rate) out.push(t);
  return out;
}

function input(over: Partial<SessionAnalysisInput>): SessionAnalysisInput {
  return {
    durationMs: 30000,
    speech: [],
    nucleiMs: [],
    snrDb: 30,
    correction: 1,
    syllablesPerWord: 2.3,
    maxContinuousMs: 10000,
    targetRate: [4.5, 5.5],
    ...over,
  };
}

describe('tempo classes', () => {
  it('classifies relative to the target range', () => {
    expect(classifyTempo(5, 3000, 15, [4.5, 5.5])).toBe('ok');
    expect(classifyTempo(6, 3000, 18, [4.5, 5.5])).toBe('fast');
    expect(classifyTempo(7, 3000, 21, [4.5, 5.5])).toBe('too_fast');
    expect(classifyTempo(3, 3000, 9, [4.5, 5.5])).toBe('slow');
    expect(classifyTempo(9, 800, 7, [4.5, 5.5])).toBe('short');
  });
});

describe('session analysis', () => {
  it('splits phrases on breath pauses and ignores short gaps', () => {
    const speech = [
      { startMs: 0, endMs: 3000 },
      { startMs: 3200, endMs: 6000 }, // 200 ms gap → same phrase
      { startMs: 7000, endMs: 10000 },
    ];
    const r = analyzeSession(input({ speech, nucleiMs: [...nuclei(0, 6000, 5), ...nuclei(7000, 10000, 5)] }));
    expect(r.phrases).toHaveLength(2);
    expect(r.pauses).toEqual([{ startMs: 6000, endMs: 7000, kind: 'breath' }]);
    expect(r.metrics.breathCount).toBe(1);
    expect(r.metrics.articulationRate).toBeGreaterThan(4.5);
    expect(r.metrics.articulationRate).toBeLessThan(5.5);
    expect(r.phrases.every((p) => p.tempo === 'ok')).toBe(true);
    expect(r.tips[0].key).toBe('all_ok');
  });

  it('flags phrases over the breath limit', () => {
    const speech = [{ startMs: 0, endMs: 14000 }, { startMs: 15000, endMs: 18000 }];
    const r = analyzeSession(input({ speech, nucleiMs: [...nuclei(0, 14000, 5), ...nuclei(15000, 18000, 5)] }));
    expect(r.phrases[0].overLimit).toBe(true);
    expect(r.phrases[1].overLimit).toBe(false);
    expect(r.metrics.overLimitPhrases).toBe(1);
    expect(r.metrics.longestPhraseMs).toBe(14000);
    const tip = r.tips.find((t) => t.key === 'breath_limit');
    expect(tip?.atMs).toBe(0);
  });

  it('detects fast speech and applies the calibration correction', () => {
    const speech = [{ startMs: 0, endMs: 4000 }, { startMs: 5000, endMs: 9000 }, { startMs: 10000, endMs: 14000 }];
    const nucleiMs = [...nuclei(0, 4000, 7.5), ...nuclei(5000, 9000, 7.5), ...nuclei(10000, 14000, 7.5)];
    const fast = analyzeSession(input({ speech, nucleiMs }));
    expect(fast.metrics.articulationRate).toBeGreaterThan(7);
    expect(fast.tips.some((t) => t.key === 'too_fast' && t.severity === 'bad')).toBe(true);

    const corrected = analyzeSession(input({ speech, nucleiMs, correction: 0.67 }));
    expect(corrected.metrics.articulationRate).toBeLessThan(5.5);
    expect(corrected.tips.some((t) => t.key === 'too_fast')).toBe(false);
  });

  it('marks long pauses and reports low SNR', () => {
    const speech = [{ startMs: 0, endMs: 3000 }, { startMs: 6000, endMs: 9000 }];
    const r = analyzeSession(input({ speech, nucleiMs: [...nuclei(0, 3000, 5), ...nuclei(6000, 9000, 5)], snrDb: 8 }));
    expect(r.pauses[0].kind).toBe('long');
    expect(r.tips.some((t) => t.key === 'noise')).toBe(true);
  });

  it('handles silence', () => {
    const r = analyzeSession(input({}));
    expect(r.metrics.phraseCount).toBe(0);
    expect(r.metrics.articulationRate).toBe(0);
    expect(r.tips[0].key).toBe('no_speech');
  });
});
