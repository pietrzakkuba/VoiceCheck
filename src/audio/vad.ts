import * as ort from 'onnxruntime-web/wasm';

/**
 * Silero VAD v5 wrapper fed with 512-sample 16 kHz frames (32 ms) from the capture worklet.
 * Own wrapper (instead of the vad-web helper) to keep sample-exact timing with our PCM stream.
 */
export class SileroVad {
  private session: ort.InferenceSession | null = null;
  private state = new Float32Array(2 * 128);
  private context = new Float32Array(64);
  private sr = new ort.Tensor('int64', BigInt64Array.from([16000n]), []);
  private queue: Promise<unknown> = Promise.resolve();

  static async create(): Promise<SileroVad> {
    const v = new SileroVad();
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    ort.env.wasm.wasmPaths = `${base}vendor/`;
    ort.env.wasm.numThreads = 1;
    v.session = await ort.InferenceSession.create(`${base}vendor/silero_vad_v5.onnx`, { executionProviders: ['wasm'] });
    return v;
  }

  reset() {
    this.state.fill(0);
    this.context.fill(0);
  }

  /** Speech probability for one 512-sample frame. Calls are serialized. */
  process(frame: Float32Array): Promise<number> {
    const run = this.queue.then(() => this.run(frame));
    this.queue = run.catch(() => 0);
    return run;
  }

  private async run(frame: Float32Array): Promise<number> {
    if (!this.session) return 0;
    const x = new Float32Array(64 + 512);
    x.set(this.context, 0);
    x.set(frame.subarray(0, 512), 64);
    this.context = x.slice(512);
    const out = await this.session.run({
      input: new ort.Tensor('float32', x, [1, x.length]),
      state: new ort.Tensor('float32', this.state, [2, 1, 128]),
      sr: this.sr,
    });
    this.state = new Float32Array(out.stateN.data as Float32Array);
    return (out.output.data as Float32Array)[0];
  }

  async dispose() {
    await this.session?.release();
    this.session = null;
  }
}

/** Offline VAD for re-analysis of stored recordings. */
export async function vadProbabilities(pcm: Float32Array, vad?: SileroVad): Promise<Float32Array> {
  const v = vad ?? (await SileroVad.create());
  v.reset();
  const n = Math.floor(pcm.length / 512);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = await v.process(pcm.subarray(i * 512, (i + 1) * 512));
  if (!vad) await v.dispose();
  return out;
}
