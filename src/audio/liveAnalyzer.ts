import type { SpeechSegment } from '@/types';
import { T } from '@/engine/thresholds';
import type { FrameOut } from '@/engine/features';
import { median, percentile } from '@/engine/features';
import { NucleusDetector } from '@/engine/syllableNuclei';
import { VadHysteresis, VAD_FRAME_MS } from '@/engine/segmentation';

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
  noiseFloorDb: number;
  calibrating: boolean;
  private clipWindow: number[] = [];
  private lastVadMs = 0;

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
    }
    const k = this.det.push(f.db, f.voicing);
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

  stats(): LiveStats {
    const now = this.elapsedMs;
    const segs = this.speechSegments();
    const winStart = now - T.liveWindowMs;
    let speechInWin = 0;
    let speechTotal = 0;
    for (const s of segs) {
      speechTotal += s.endMs - s.startMs;
      speechInWin += Math.max(0, s.endMs - Math.max(s.startMs, winStart));
    }
    let rate: number | null = null;
    if (speechInWin >= T.liveMinSpeechMs) {
      // Only nuclei inside speech count.
      let n = 0;
      for (let i = this.nuclei.length - 1; i >= 0 && this.nuclei[i] >= winStart; i--) {
        const t = this.nuclei[i];
        if (segs.some((s) => t >= s.startMs - 30 && t <= s.endMs + 30)) n++;
      }
      rate = (n * this.o.correction) / (speechInWin / 1000);
    }
    // Breath run: merge segments separated by <350 ms.
    let runMs = 0;
    if (this.vad.speaking && segs.length) {
      let start = segs[segs.length - 1].startMs;
      for (let i = segs.length - 2; i >= 0; i--) {
        if (start - segs[i].endMs < T.breathPauseMs) start = segs[i].startMs;
        else break;
      }
      runMs = this.lastVadMs - start;
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
    };
  }
}
