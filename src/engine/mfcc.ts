// Minimal MFCC front-end used only for spectral-stability (|ΔMFCC|) in filler detection (5.9).
const SR = 16000;
const HOP = 160;
const WIN = 400;
const NFFT = 512;
const NMEL = 26;
const NCEP = 13;

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const mel = (f: number) => 2595 * Math.log10(1 + f / 700);
const imel = (m: number) => 700 * (10 ** (m / 2595) - 1);

let filterBank: Float64Array[] | null = null;
function getFilterBank(): Float64Array[] {
  if (filterBank) return filterBank;
  const bins = NFFT / 2 + 1;
  const mMin = mel(60);
  const mMax = mel(7600);
  const pts = Array.from({ length: NMEL + 2 }, (_, i) => imel(mMin + ((mMax - mMin) * i) / (NMEL + 1)));
  const bin = pts.map((f) => Math.floor(((NFFT + 1) * f) / SR));
  filterBank = Array.from({ length: NMEL }, (_, m) => {
    const fb = new Float64Array(bins);
    for (let k = bin[m]; k < bin[m + 1]; k++) fb[k] = (k - bin[m]) / Math.max(1, bin[m + 1] - bin[m]);
    for (let k = bin[m + 1]; k < bin[m + 2]; k++) fb[k] = (bin[m + 2] - k) / Math.max(1, bin[m + 2] - bin[m + 1]);
    return fb;
  });
  return filterBank;
}

const hamming = Float64Array.from({ length: WIN }, (_, i) => 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (WIN - 1)));

export function mfccFrame(x: Float32Array, start: number): Float64Array {
  const re = new Float64Array(NFFT);
  const im = new Float64Array(NFFT);
  for (let i = 0; i < WIN; i++) {
    const j = start + i;
    re[i] = j >= 0 && j < x.length ? x[j] * hamming[i] : 0;
  }
  fft(re, im);
  const bins = NFFT / 2 + 1;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) power[k] = re[k] * re[k] + im[k] * im[k];
  const fb = getFilterBank();
  const logMel = fb.map((f) => {
    let s = 0;
    for (let k = 0; k < bins; k++) s += f[k] * power[k];
    return Math.log(s + 1e-10);
  });
  const out = new Float64Array(NCEP);
  for (let c = 0; c < NCEP; c++) {
    let s = 0;
    for (let m = 0; m < NMEL; m++) s += logMel[m] * Math.cos((Math.PI * c * (m + 0.5)) / NMEL);
    out[c] = s * Math.sqrt(2 / NMEL);
  }
  return out;
}

/** Mean |Δc| over cepstral coefficients 1..12 per 10 ms frame (spectral change). */
export function mfccDeltaTrack(x: Float32Array): Float32Array {
  const n = Math.floor(x.length / HOP);
  const out = new Float32Array(n);
  let prev: Float64Array | null = null;
  for (let i = 0; i < n; i++) {
    const cur = mfccFrame(x, i * HOP + HOP / 2 - WIN / 2);
    if (prev) {
      let s = 0;
      for (let c = 1; c < NCEP; c++) s += Math.abs(cur[c] - prev[c]);
      out[i] = s / (NCEP - 1);
    }
    prev = cur;
  }
  return out;
}
