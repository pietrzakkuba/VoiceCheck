import { describe, expect, it } from 'vitest';
import { LiveAnalyzer } from './liveAnalyzer';
import { estimateOffsetMs } from './decode';

describe('LiveAnalyzer', () => {
  it('calibrates noise floor and tracks breath runs', () => {
    const la = new LiveAnalyzer({ calibrateMs: 2000, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    // 2 s silence at -60 dB
    for (let i = 0; i < 200; i++) la.pushFrame({ db: -60, voicing: 0, clipped: 0 });
    expect(la.calibrating).toBe(false);
    expect(la.noiseFloorDb).toBeCloseTo(-60, 0);
    // 7 s of speech with 5 syllables/s (sinusoidal envelope)
    for (let i = 0; i < 700; i++) {
      const t = i / 100;
      const env = Math.abs(Math.sin(Math.PI * 5 * t));
      la.pushFrame({ db: -50 + 35 * env, voicing: env > 0.3 ? 0.8 : 0.1, clipped: 0 });
      if (i % 3 === 0) la.pushVad(0.9, 2000 + i * 10);
    }
    const s = la.stats();
    expect(s.speaking).toBe(true);
    expect(s.breathRunMs).toBeGreaterThan(6500);
    expect(s.breathState).toBe('warn');
    expect(s.syllableRate).not.toBeNull();
    expect(s.syllableRate!).toBeGreaterThan(3.5);
    expect(s.syllableRate!).toBeLessThan(6.5);
  });

  it('counts corrected syllables in speech, excluding calibration and silence', () => {
    const la = new LiveAnalyzer({ calibrateMs: 2000, correction: 1.5, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    la.nuclei.push(500, 1500, 2100, 2400, 3000, 4100);
    la.vad.segments.push({ startMs: 0, endMs: 2450 }, { startMs: 4000, endMs: 4500 });
    expect(la.stats().syllables).toBe(0);
    for (let i = 0; i < 200; i++) la.pushFrame({ db: -60, voicing: 0, clipped: 0 });
    expect(la.stats().syllables).toBe(4.5);
    expect(la.stats().syllableRate).toBeNull();
    for (let i = 0; i < 2000; i++) la.pushFrame({ db: -60, voicing: 0, clipped: 0 });
    expect(la.stats().syllables).toBe(4.5);
  });

  it('includes the open speech segment and preserves the count across pauses', () => {
    const la = new LiveAnalyzer({ calibrateMs: 0, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    la.pushVad(0.9, 0);
    la.nuclei.push(100, 300, 600);
    la.pushVad(0.9, 700);
    expect(la.stats().syllables).toBe(3);
    la.pushVad(0.1, 800);
    la.nuclei.push(1500);
    la.pushVad(0.1, 2000);
    expect(la.stats().syllables).toBe(3);
    la.pushVad(0.9, 3000);
    la.nuclei.push(3100);
    la.pushVad(0.9, 3200);
    expect(la.stats().syllables).toBe(4);
    const fresh = new LiveAnalyzer({ calibrateMs: 0, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    expect(fresh.stats().syllables).toBe(0);
  });

  it('does not exclude early speech when a known noise floor skips calibration', () => {
    const la = new LiveAnalyzer({ calibrateMs: 2000, noiseFloorDb: -60, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    la.vad.segments.push({ startMs: 0, endMs: 1000 });
    la.nuclei.push(100, 300);
    expect(la.stats().syllables).toBe(2);
  });
});

describe('estimateOffsetMs', () => {
  it('finds a shifted envelope', () => {
    const a: number[] = [];
    for (let i = 0; i < 1000; i++) a.push(Math.sin(i / 7) * 20 + (i % 97 < 30 ? 10 : -30));
    const shift = 12;
    const b = a.map((_, i) => a[Math.max(0, i - shift)]);
    expect(estimateOffsetMs(a, b)).toBe(shift * 10);
  });
});
