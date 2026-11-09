// YIN fundamental frequency estimator (5.10): 40 ms window, 10 ms hop, 75–400 Hz.
const SR = 16000;
const WIN = 640;
const HOP = 160;
const TAU_MIN = Math.floor(SR / 400);
const TAU_MAX = Math.ceil(SR / 75);
const W = WIN - TAU_MAX;
const THRESHOLD = 0.15;

export function yinFrame(x: Float32Array, start: number): number {
  if (start < 0 || start + WIN > x.length) return 0;
  const d = new Float32Array(TAU_MAX + 1);
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    let s = 0;
    for (let j = 0; j < W; j++) {
      const diff = x[start + j] - x[start + j + tau];
      s += diff * diff;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  let run = 0;
  const cmnd = new Float32Array(TAU_MAX + 1);
  cmnd[0] = 1;
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    run += d[tau];
    cmnd[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tauEst = -1;
  for (let tau = TAU_MIN; tau <= TAU_MAX; tau++) {
    if (cmnd[tau] < THRESHOLD) {
      while (tau + 1 <= TAU_MAX && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }
  if (tauEst < 0) return 0;
  // Parabolic interpolation.
  const a = cmnd[tauEst - 1] ?? cmnd[tauEst];
  const b = cmnd[tauEst];
  const c = cmnd[tauEst + 1] ?? cmnd[tauEst];
  const den = a + c - 2 * b;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const f0 = SR / (tauEst + (Math.abs(shift) < 1 ? shift : 0));
  return f0 >= 70 && f0 <= 420 ? f0 : 0;
}

/** F0 track (Hz, 0 = unvoiced) for every 10 ms frame. Frames quieter than `minDb` are skipped. */
export function yinTrack(x: Float32Array, minDb = -50): Float32Array {
  const n = Math.floor(x.length / HOP);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = i * HOP + HOP / 2 - WIN / 2;
    if (start < 0 || start + WIN > x.length) continue;
    let e = 0;
    for (let j = start; j < start + WIN; j++) e += x[j] * x[j];
    const db = 10 * Math.log10(e / WIN + 1e-10);
    if (db < minDb) continue;
    out[i] = yinFrame(x, start);
  }
  return out;
}

export function hzToSemitones(hz: number, refHz: number): number {
  return 12 * Math.log2(hz / refHz);
}
