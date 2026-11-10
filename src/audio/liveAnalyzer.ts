import type { SpeechSegment } from '@/types';
import { T } from '@/engine/thresholds';
import type { FrameOut } from '@/engine/features';
import { median, percentile } from '@/engine/features';
import { NucleusDetector } from '@/engine/syllableNuclei';
import { VadHysteresis, VAD_FRAME_MS, mergeSegments, quietFrames, quietThresholdDb, refineSegments } from '@/engine/segmentation';

export interface LiveStats {
  elapsedMs: number;
  calibrating: boolean;
  levelDb: number;
  noiseFloorDb: number;
  snrDb: number | null;
  speaking: boolean;
  /** Live articulation rate in syllables/s (null until ≥3 s of speech in the 10 s window). */
  syllableRate: number | null;
  wpm: number | null;
  /** Current continuous speech run (breath pauses are ≥350 ms). */
  breathRunMs: number;
  breathState: 'ok' | 'warn' | 'critical';
  clipping: boolean;
  speechMs: number;
  /** Cumulative corrected syllable count inside speech, excluding initial calibration. */
  syllables: number;
}

export interface LiveAnalyzerOptions {
  calibrateMs: number;
  /** Known noise floor (e.g. from previous answer in a bot conversation) – skips calibration. */
  noiseFloorDb?: number;
  correction: number;
  syllablesPerWord: number;
  maxContinuousMs: number;
}

/** Live HUD logic (4.1–4.3): noise floor, syllable nuclei, live AR, breath runs. Pure – fed with frames and VAD probabilities. */
export class LiveAnalyzer {
  readonly db: number[] = [];
  readonly voicing: number[] = [];
  readonly nuclei: number[] = [];
  readonly vad = new VadHysteresis();
  private det: NucleusDetector;
  private calib: number[] = [];
  private silence: number[] = [];
  private speechDb: number[] = [];
  private voicedDb: number[] = [];
  private speechLevel = NaN;
  noiseFloorDb: number;
  calibrating: boolean;
  private clipWindow: number[] = [];
  private lastVadMs = 0;
  private smoothRate: number | null = null;
  private smoothAtMs = 0;

  constructor(private o: LiveAnalyzerOptions) {
    this.noiseFloorDb = o.noiseFloorDb ?? -60;
    this.calibrating = o.noiseFloorDb === undefined && o.calibrateMs > 0;
    this.det = new NucleusDetector(this.noiseFloorDb);
  }

  get elapsedMs() {
    return this.db.length * 10;
  }

  pushFrame(f: FrameOut) {
    const t = this.elapsedMs;
    this.db.push(f.db);
    this.voicing.push(f.voicing);
    this.clipWindow.push(f.clipped);
    if (this.clipWindow.length > 100) this.clipWindow.shift();

    if (this.calibrating) {
      this.calib.push(f.db);
      if (t + 10 >= this.o.calibrateMs) {
        this.calibrating = false;
        this.noiseFloorDb = median(this.calib);
        this.det.noiseFloor = this.noiseFloorDb;
      }
    } else if (!this.vad.speaking && t > this.o.calibrateMs + 300) {
      // Adaptive noise floor: 10th percentile of VAD-silence frames.
      this.silence.push(f.db);
      if (this.silence.length > 500) this.silence.shift();
      if (this.silence.length >= 100 && this.silence.length % 20 === 0) {
        const p10 = percentile(this.silence, 10);
        this.noiseFloorDb = 0.7 * this.noiseFloorDb + 0.3 * p10;
        this.det.noiseFloor = this.noiseFloorDb;
      }
    }
    if (this.vad.speaking) {
      this.speechDb.push(f.db);
      if (this.speechDb.length > 1000) this.speechDb.shift();
      if (f.voicing > T.nucleusVoicing) {
        this.voicedDb.push(f.db);
        if (this.voicedDb.length > 1000) this.voicedDb.shift();
        if (this.voicedDb.length >= 30 && this.voicedDb.length % 10 === 0) this.speechLevel = median(this.voicedDb);
      }
    }
    const k = this.det.push(f.bandDb, f.db, f.voicing);
    if (k >= 0) this.nuclei.push(k * 10);
  }

  pushVad(p: number, frameStartMs: number) {
    this.lastVadMs = frameStartMs + VAD_FRAME_MS;
    return this.vad.push(p, frameStartMs);
  }

  /** Closed segments + the open one (if speaking). */
  speechSegments(nowMs = this.lastVadMs): SpeechSegment[] {
    const segs = [...this.vad.segments];
    if (this.vad.speaking) segs.push({ startMs: this.vad.speechStartMs, endMs: nowMs });
    return segs;
  }

  /** VAD segments refined with the intensity track (quiet edges trimmed, split at quiet runs). */
  refinedSegments(nowMs = this.lastVadMs): SpeechSegment[] {
    const thr = quietThresholdDb(this.noiseFloorDb, this.speechLevel);
    return refineSegments(this.speechSegments(nowMs), quietFrames(this.db, this.voicing, thr), this.db.length);
  }

  stats(): LiveStats {
    const now = this.elapsedMs;
    const segs = this.refinedSegments();
    // Phrases as in the session report: short gaps (< breath pause) belong to the phrase.
    const runs = mergeSegments(segs, T.breathPauseMs);
    const winStart = now - T.liveWindowMs;
    let speechInWin = 0;
    let speechTotal = 0;
    for (const s of runs) {
      speechTotal += s.endMs - s.startMs;
      speechInWin += Math.max(0, s.endMs - Math.max(s.startMs, winStart));
    }
    const speechStart = this.o.noiseFloorDb === undefined ? this.o.calibrateMs : 0;
    let syllables = 0;
    let segment = 0;
    for (const t of this.nuclei) {
      if (t < speechStart || this.calibrating) continue;
      while (segment < runs.length && t > runs[segment].endMs + 30) segment++;
      if (segment === runs.length) break;
      if (t >= runs[segment].startMs - 30) syllables++;
    }
    let rate: number | null = null;
    if (speechInWin >= T.liveMinSpeechMs) {
      // Only nuclei inside speech count.
      let n = 0;
      for (let i = this.nuclei.length - 1; i >= 0 && this.nuclei[i] >= winStart; i--) {
        const t = this.nuclei[i];
        if (runs.some((s) => t >= s.startMs - 30 && t <= s.endMs + 30)) n++;
      }
      rate = this.smooth((n * this.o.correction) / (speechInWin / 1000), now);
    } else {
      this.smoothRate = null;
    }
    // Breath run: the current phrase, unless a breath-length pause is in progress.
    let runMs = 0;
    const last = runs[runs.length - 1];
    if (this.vad.speaking && last && this.lastVadMs - last.endMs < T.breathPauseMs) {
      runMs = Math.max(0, this.lastVadMs - last.startMs);
    }
    const ratio = runMs / this.o.maxContinuousMs;
    const clipRatio = this.clipWindow.length ? this.clipWindow.reduce((a, b) => a + b, 0) / this.clipWindow.length : 0;
    const level = this.db.length ? Math.max(...this.db.slice(-5)) : -100;
    return {
      elapsedMs: now,
      calibrating: this.calibrating,
      levelDb: level,
      noiseFloorDb: this.noiseFloorDb,
      snrDb: this.speechDb.length > 50 ? median(this.speechDb) - this.noiseFloorDb : null,
      speaking: this.vad.speaking,
      syllableRate: rate,
      wpm: rate !== null ? (rate * 60) / this.o.syllablesPerWord : null,
      breathRunMs: runMs,
      breathState: ratio >= 1 ? 'critical' : ratio >= T.breathWarnRatio ? 'warn' : 'ok',
      clipping: clipRatio > T.clipRatio,
      speechMs: speechTotal,
      syllables: syllables * this.o.correction,
    };
  }

  /** Time-based exponential smoothing (independent of how often stats() is called). */
  private smooth(rate: number, nowMs: number): number {
    if (this.smoothRate === null || nowMs < this.smoothAtMs) {
      this.smoothRate = rate;
    } else {
      const a = 1 - Math.exp(-(nowMs - this.smoothAtMs) / T.liveSmoothingMs);
      this.smoothRate += a * (rate - this.smoothRate);
    }
    this.smoothAtMs = nowMs;
    return this.smoothRate;
  }
}
