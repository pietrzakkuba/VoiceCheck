import { describe, expect, it } from 'vitest';
import { LiveAnalyzer } from './liveAnalyzer';
import { estimateOffsetMs } from './decode';
import { rateZone } from '@/components/audio/SpeedometerGauge';

const fr = (db: number, voicing: number) => ({ db, bandDb: db, voicing, clipped: 0 });

describe('LiveAnalyzer', () => {
  it('calibrates noise floor and tracks breath runs', () => {
    const la = new LiveAnalyzer({ calibrateMs: 2000, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    // 2 s silence at -60 dB
    for (let i = 0; i < 200; i++) la.pushFrame(fr(-60, 0));
    expect(la.calibrating).toBe(false);
    expect(la.noiseFloorDb).toBeCloseTo(-60, 0);
    // 7 s of speech with 5 syllables/s (sinusoidal envelope)
    for (let i = 0; i < 700; i++) {
      const t = i / 100;
      const env = Math.abs(Math.sin(Math.PI * 5 * t));
      la.pushFrame(fr(-50 + 35 * env, env > 0.3 ? 0.8 : 0.1));
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
    for (let i = 0; i < 200; i++) la.pushFrame(fr(-60, 0));
    expect(la.stats().syllables).toBe(4.5);
    expect(la.stats().syllableRate).toBeNull();
    // Frames matching the VAD segments: speech until 2450 ms, silence, speech 4000–4500 ms, silence.
    // Loud but unvoiced, so the synthetic plateaus do not add nuclei.
    for (let i = 200; i < 2200; i++) {
      const speech = i < 245 || (i >= 400 && i < 450);
      la.pushFrame(speech ? fr(-30, 0.3) : fr(-60, 0));
    }
    expect(la.stats().syllables).toBe(4.5);
  });

  it('measures the same tempo whether VAD splits a phrase or not', () => {
    const run = (segments: { startMs: number; endMs: number }[]) => {
      const la = new LiveAnalyzer({ calibrateMs: 0, noiseFloorDb: -60, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
      for (let i = 0; i < 1000; i++) la.pushFrame(fr(-30, 0.8));
      la.vad.segments.push(...segments);
      for (let t = 50; t < 10000; t += 200) la.nuclei.push(t);
      return la.stats().syllableRate!;
    };
    const whole = run([{ startMs: 0, endMs: 10000 }]);
    // VAD drops out for 200 ms in a few places (below the breath-pause threshold).
    const split = run([{ startMs: 0, endMs: 2000 }, { startMs: 2200, endMs: 5000 }, { startMs: 5200, endMs: 10000 }]);
    expect(whole).toBeCloseTo(5, 1);
    expect(split).toBeCloseTo(whole, 5);
  });

  it('smooths the live tempo over time', () => {
    const la = new LiveAnalyzer({ calibrateMs: 0, noiseFloorDb: -60, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 20000 });
    la.pushVad(0.9, 0);
    for (let t = 50; t < 5000; t += 200) la.nuclei.push(t);
    for (let i = 0; i < 500; i++) la.pushFrame(fr(-30, 0.8));
    la.pushVad(0.9, 4968);
    const before = la.stats().syllableRate!;
    // A burst of extra nuclei within 100 ms moves the displayed rate only slightly.
    for (let t = 5000; t < 5100; t += 10) la.nuclei.push(t);
    for (let i = 0; i < 10; i++) la.pushFrame(fr(-30, 0.8));
    la.pushVad(0.9, 5068);
    const after = la.stats().syllableRate!;
    expect(after - before).toBeGreaterThan(0);
    expect(after - before).toBeLessThan(0.2);
  });

  it('resets the breath run on a short quiet breath that VAD misses', () => {
    const la = new LiveAnalyzer({ calibrateMs: 0, noiseFloorDb: -60, correction: 1, syllablesPerWord: 2.3, maxContinuousMs: 8000 });
    const vadUntil = (ms: number) => { for (let t = 0; t < ms; t += 32) la.pushVad(0.9, t); };
    for (let i = 0; i < 400; i++) la.pushFrame(fr(-25, 0.8));
    for (let i = 0; i < 35; i++) la.pushFrame(fr(-58, 0.1));
    for (let i = 0; i < 100; i++) la.pushFrame(fr(-25, 0.8));
    vadUntil(5350);
    const s = la.stats();
    expect(s.speaking).toBe(true);
    expect(s.breathRunMs).toBeLessThan(1200);
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

describe('rateZone hysteresis', () => {
  it('keeps the previous zone near a boundary', () => {
    const t: [number, number] = [4.5, 5.5];
    expect(rateZone(5.6, t).key).toBe('fast');
    expect(rateZone(5.6, t, 'ok', 0.25).key).toBe('ok');
    expect(rateZone(5.8, t, 'ok', 0.25).key).toBe('fast');
    expect(rateZone(5.4, t, 'fast', 0.25).key).toBe('fast');
    expect(rateZone(5.2, t, 'fast', 0.25).key).toBe('ok');
    expect(rateZone(7.5, t, 'ok', 0.25).key).toBe('too_fast');
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
