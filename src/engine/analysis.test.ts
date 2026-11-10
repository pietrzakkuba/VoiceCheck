import { describe, expect, it } from 'vitest';
import { vadSegments, mergeSegments, refineSegments, refineSpeech } from './segmentation';
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
    const n = detectNuclei(f.bandDb, f.db, f.voicing, -60);
    expect(n.length).toBeGreaterThanOrEqual(9);
    expect(n.length).toBeLessThanOrEqual(11);
  });

  it('ignores weak echo peaks far below the speech level', () => {
    // Loud syllables at 4/s, each followed by a weak bump (−30 dB) that the old detector counted.
    const x = tone(4, 150, (t) => {
      const ph = (t * 4) % 1;
      return 0.002 + (ph < 0.5 ? 0.3 * Math.sin(Math.PI * ph * 2) ** 2 : 0.01 * Math.sin(Math.PI * (ph - 0.5) * 2) ** 2);
    });
    const f = extractFeatures(x);
    const n = detectNuclei(f.bandDb, f.db, f.voicing, -70);
    expect(n.length).toBeGreaterThanOrEqual(14);
    expect(n.length).toBeLessThanOrEqual(17);
  });
});

describe('energy-based pauses', () => {
  const frames = (spec: [number, number, boolean][]) => {
    const db: number[] = [];
    const voicing: number[] = [];
    for (const [ms, level, voiced] of spec) {
      for (let i = 0; i < ms / 10; i++) { db.push(level); voicing.push(voiced ? 0.8 : 0.1); }
    }
    return { db, voicing };
  };

  it('splits a VAD segment at a short quiet breath and trims the VAD hangover', () => {
    // speech 2 s, inhale 300 ms (unvoiced, −30 dB below speech), speech 2 s, then 400 ms of silence still marked as speech.
    const { db, voicing } = frames([[2000, -25, true], [300, -55, false], [2000, -25, true], [400, -62, false]]);
    const out = refineSpeech([{ startMs: 0, endMs: 4700 }], db, voicing, -65);
    expect(out).toEqual([{ startMs: 0, endMs: 2000 }, { startMs: 2300, endMs: 4300 }]);
  });

  it('keeps short gaps and unvoiced consonants inside a phrase', () => {
    const { db, voicing } = frames([[1000, -25, true], [150, -50, false], [1000, -25, true], [200, -35, false], [500, -25, true]]);
    expect(refineSpeech([{ startMs: 0, endMs: 2850 }], db, voicing, -65)).toEqual([{ startMs: 0, endMs: 2850 }]);
  });

  it('drops segments that are quiet throughout (inhale classified as speech)', () => {
    const { db, voicing } = frames([[1000, -25, true], [500, -62, false], [400, -50, false], [500, -62, false], [1000, -25, true]]);
    const out = refineSpeech([{ startMs: 0, endMs: 1000 }, { startMs: 1500, endMs: 1900 }, { startMs: 2400, endMs: 3400 }], db, voicing, -65);
    expect(out).toEqual([{ startMs: 0, endMs: 1000 }, { startMs: 2400, endMs: 3400 }]);
  });

  it('treats frames that are not analysed yet as speech', () => {
    expect(refineSegments([{ startMs: 0, endMs: 500 }], () => true, 20)).toEqual([{ startMs: 200, endMs: 500 }]);
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
