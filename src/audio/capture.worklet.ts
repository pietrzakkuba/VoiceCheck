// AudioWorklet: converts microphone input to mono 16 kHz PCM and posts 512-sample blocks (32 ms – one Silero VAD frame).
// Self-contained on purpose (no imports) so it loads in every browser's worklet scope.

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

const TARGET = 16000;
const BLOCK = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  private ratio = sampleRate / TARGET;
  private buf = new Float32Array(BLOCK);
  private n = 0;
  private clipped = 0;
  // Resampler state (biquad low-pass + fractional read position).
  private pos = 0;
  private prev = 0;
  private z1 = 0;
  private z2 = 0;
  private b0 = 1; private b1 = 0; private b2 = 0; private a1 = 0; private a2 = 0;
  private paused = false;

  constructor() {
    super();
    if (this.ratio !== 1) {
      // Butterworth low-pass at 7 kHz (anti-aliasing before decimation).
      const w = (2 * Math.PI * 7000) / sampleRate;
      const q = Math.SQRT1_2;
      const alpha = Math.sin(w) / (2 * q);
      const cos = Math.cos(w);
      const a0 = 1 + alpha;
      this.b0 = (1 - cos) / 2 / a0;
      this.b1 = (1 - cos) / a0;
      this.b2 = (1 - cos) / 2 / a0;
      this.a1 = (-2 * cos) / a0;
      this.a2 = (1 - alpha) / a0;
    }
    this.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'pause') this.paused = !!e.data.value;
    };
  }

  private push(s: number) {
    if (Math.abs(s) >= 0.99) this.clipped++;
    this.buf[this.n++] = s;
    if (this.n === BLOCK) {
      const out = this.buf;
      this.port.postMessage({ type: 'pcm', pcm: out, clipped: this.clipped, paused: this.paused }, [out.buffer]);
      this.buf = new Float32Array(BLOCK);
      this.n = 0;
      this.clipped = 0;
    }
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || !input.length) return true;
    const len = input[0].length;
    const ch = input.length;
    for (let i = 0; i < len; i++) {
      let x = 0;
      for (let c = 0; c < ch; c++) x += input[c][i];
      x /= ch;
      if (this.ratio === 1) {
        this.push(x);
        continue;
      }
      // Direct form II transposed biquad.
      const y = this.b0 * x + this.z1;
      this.z1 = this.b1 * x - this.a1 * y + this.z2;
      this.z2 = this.b2 * x - this.a2 * y;
      // Linear interpolation between consecutive filtered input samples.
      while (this.pos <= 1) {
        this.push(this.prev + (y - this.prev) * this.pos);
        this.pos += this.ratio;
      }
      this.pos -= 1;
      this.prev = y;
    }
    return true;
  }
}

registerProcessor('cv-capture', CaptureProcessor);
