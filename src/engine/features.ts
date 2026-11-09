// Frame features shared by the AudioWorklet (live) and offline re-analysis.
// 10 ms hop at 16 kHz: intensity (50 ms window, dBFS), voicing (normalised autocorrelation in the 75–400 Hz F0 range).

export const SR = 16000;
export const HOP = 160;
const INT_WIN = 800;
const VOICE_WIN = 640;
// Voicing is computed on a 2× decimated signal (8 kHz) – enough for F0 ≤ 400 Hz and 4× cheaper.
const LAG_MIN = Math.floor(SR / 2 / 400);
const LAG_MAX = Math.ceil(SR / 2 / 75);

export interface FrameOut {
  db: number;
  voicing: number;
  clipped: number;
}

export function frameDb(buf: Float32Array, start: number, len: number): number {
  let s = 0;
  const end = Math.min(buf.length, start + len);
  const from = Math.max(0, start);
  for (let i = from; i < end; i++) s += buf[i] * buf[i];
  const n = Math.max(1, end - from);
  return 10 * Math.log10(s / n + 1e-10);
}

export function frameVoicing(buf: Float32Array, start: number, len: number): number {
  const from = Math.max(0, start);
  const end = Math.min(buf.length, start + len);
  const n = Math.floor((end - from) / 2);
  if (n <= LAG_MAX + 8) return 0;
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    x[i] = 0.5 * (buf[from + 2 * i] + buf[from + 2 * i + 1]);
    mean += x[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) x[i] -= mean;
  let best = 0;
  for (let lag = LAG_MIN; lag <= LAG_MAX; lag++) {
    let num = 0;
    let e0 = 0;
    let e1 = 0;
    for (let i = 0; i + lag < n; i++) {
      num += x[i] * x[i + lag];
      e0 += x[i] * x[i];
      e1 += x[i + lag] * x[i + lag];
    }
    const den = Math.sqrt(e0 * e1);
    if (den > 1e-9) {
      const r = num / den;
      if (r > best) best = r;
    }
  }
  return best;
}

/** Streaming extractor – push arbitrary-length blocks, receive one FrameOut every 10 ms. */
export class FeatureExtractor {
  private buf = new Float32Array(SR * 2);
  private len = 0;
  private nextCenter = HOP / 2;
  private consumed = 0;

  push(block: Float32Array, onFrame: (f: FrameOut) => void) {
    if (this.len + block.length > this.buf.length) {
      const keep = INT_WIN;
      const drop = this.len - keep;
      this.buf.copyWithin(0, drop, this.len);
      this.len = keep;
      this.consumed += drop;
    }
    this.buf.set(block, this.len);
    this.len += block.length;
    while (this.nextCenter + INT_WIN / 2 - this.consumed <= this.len) {
      const c = this.nextCenter - this.consumed;
      onFrame(computeFrame(this.buf.subarray(0, this.len), c));
      this.nextCenter += HOP;
    }
  }
}

function computeFrame(buf: Float32Array, center: number): FrameOut {
  const db = frameDb(buf, center - INT_WIN / 2, INT_WIN);
  const voicing = db > -60 ? frameVoicing(buf, center - VOICE_WIN / 2, VOICE_WIN) : 0;
  let clipped = 0;
  for (let i = Math.max(0, center - HOP / 2); i < Math.min(buf.length, center + HOP / 2); i++) if (Math.abs(buf[i]) >= 0.99) clipped++;
  return { db, voicing, clipped: clipped / HOP };
}

/** Offline: full-buffer extraction (used for re-analysis of stored recordings). */
export function extractFeatures(pcm: Float32Array): { db: Float32Array; voicing: Float32Array; clipped: Float32Array } {
  const n = Math.floor(pcm.length / HOP);
  const db = new Float32Array(n);
  const voicing = new Float32Array(n);
  const clipped = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const f = computeFrame(pcm, i * HOP + HOP / 2);
    db[i] = f.db;
    voicing[i] = f.voicing;
    clipped[i] = f.clipped;
  }
  return { db, voicing, clipped };
}

export function median(values: ArrayLike<number>): number {
  const a = Array.from(values).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function percentile(values: ArrayLike<number>, p: number): number {
  const a = Array.from(values).filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return NaN;
  const idx = Math.min(a.length - 1, Math.max(0, Math.round((p / 100) * (a.length - 1))));
  return a[idx];
}

/** Down-sampled peak waveform for drawing (~100 points/s). */
export function peakWaveform(pcm: Float32Array, pointsPerSecond = 100): number[] {
  const step = Math.max(1, Math.floor(SR / pointsPerSecond));
  const out: number[] = [];
  for (let i = 0; i < pcm.length; i += step) {
    let m = 0;
    for (let j = i; j < Math.min(pcm.length, i + step); j++) m = Math.max(m, Math.abs(pcm[j]));
    out.push(Math.round(m * 1000) / 1000);
  }
  return out;
}
