import { SR, frameDb, HOP } from '@/engine/features';

/** Decodes a stored recording to mono 16 kHz PCM (re-analysis, 7.6). */
export async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const buf = await blob.arrayBuffer();
  const tmp = new AudioContext();
  try {
    const audio = await tmp.decodeAudioData(buf);
    const len = Math.ceil(audio.duration * SR);
    const off = new OfflineAudioContext(1, len, SR);
    const src = off.createBufferSource();
    src.buffer = audio;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return out.getChannelData(0).slice();
  } finally {
    void tmp.close();
  }
}

export function dbEnvelope(pcm: Float32Array): Float32Array {
  const n = Math.floor(pcm.length / HOP);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = frameDb(pcm, i * HOP - 320, 800);
  return out;
}

/**
 * Offset (ms) of the MediaRecorder track relative to the PCM time base, by cross-correlating dB envelopes (±500 ms).
 * An event at PCM time t is heard at recording time t + offset.
 */
export function estimateOffsetMs(pcmDb: ArrayLike<number>, recDb: ArrayLike<number>, maxLagFrames = 50): number {
  const n = Math.min(pcmDb.length, recDb.length, 3000);
  if (n < 100) return 0;
  const norm = (a: ArrayLike<number>) => {
    const x = Array.from({ length: n }, (_, i) => Math.max(a[i], -80));
    const m = x.reduce((s, v) => s + v, 0) / n;
    return x.map((v) => v - m);
  };
  const a = norm(pcmDb);
  const b = norm(recDb);
  let best = 0;
  let bestLag = 0;
  for (let lag = -maxLagFrames; lag <= maxLagFrames; lag++) {
    let s = 0;
    for (let i = Math.max(0, -lag); i < Math.min(n, n - lag); i++) s += a[i] * b[i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return bestLag * 10;
}
