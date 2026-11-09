import type { SpeechSegment } from '@/types';
import workletUrl from './capture.worklet.ts?worker&url';
import { FeatureExtractor, SR } from '@/engine/features';
import { ChunkPlanner, type Chunk, VAD_FRAME_MS } from '@/engine/segmentation';
import { SileroVad } from './vad';
import { AudioRecorder } from './recorder';
import { LiveAnalyzer, type LiveStats } from './liveAnalyzer';
import { LiveCaptions } from './liveCaptions';

export interface CaptureOptions {
  deviceId?: string;
  calibrateMs: number;
  noiseFloorDb?: number;
  correction: number;
  syllablesPerWord: number;
  maxContinuousMs: number;
  captions?: boolean;
  onStats?: (s: LiveStats) => void;
  onChunk?: (c: Chunk) => void;
  onCaption?: (finalText: string, interim: string) => void;
  /** Fires after `silenceStopMs` of silence following speech (bot mode). */
  onLongSilence?: () => void;
  silenceStopMs?: number;
}

export interface CaptureResult {
  pcm: Float32Array;
  blob: Blob;
  mimeType: string;
  db: Float32Array;
  voicing: Float32Array;
  speech: SpeechSegment[];
  nuclei: number[];
  noiseFloorDb: number;
  durationMs: number;
  chunks: Chunk[];
  deviceLabel: string;
  clipping: boolean;
}

export class MicError extends Error {
  constructor(public kind: 'denied' | 'notfound' | 'unsupported' | 'other', message: string) {
    super(message);
  }
}

let sharedVad: Promise<SileroVad> | null = null;
function getVad() {
  sharedVad ??= SileroVad.create().catch((e) => {
    sharedVad = null;
    throw e;
  });
  return sharedVad;
}
/** Warm up the VAD model (small, local file). */
export const preloadVad = () => getVad().catch(() => undefined);
export const sharedVadInstance = () => getVad();

export async function listMicrophones(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
}

/** One recording (one answer): mic → worklet (16 kHz) → features/VAD/live HUD + MediaRecorder. */
export class MicCapture {
  private ctx!: AudioContext;
  private stream!: MediaStream;
  private node!: AudioWorkletNode;
  private recorder!: AudioRecorder;
  private vad!: SileroVad;
  private fx = new FeatureExtractor();
  private blocks: Float32Array[] = [];
  private samples = 0;
  private planner = new ChunkPlanner();
  readonly chunks: Chunk[] = [];
  readonly live: LiveAnalyzer;
  private captions: LiveCaptions | null = null;
  private lastStats = 0;
  private stopped = false;
  private vadChain: Promise<void> = Promise.resolve();
  private silenceFired = false;
  deviceLabel = '';

  private constructor(private o: CaptureOptions) {
    this.live = new LiveAnalyzer({
      calibrateMs: o.calibrateMs, noiseFloorDb: o.noiseFloorDb, correction: o.correction,
      syllablesPerWord: o.syllablesPerWord, maxContinuousMs: o.maxContinuousMs,
    });
  }

  static async start(o: CaptureOptions): Promise<MicCapture> {
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      throw new MicError('unsupported', 'Ta przeglądarka nie obsługuje nagrywania (getUserMedia / AudioWorklet).');
    }
    const c = new MicCapture(o);
    try {
      c.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: o.deviceId ? { exact: o.deviceId } : undefined,
          channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false,
        },
      });
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') throw new MicError('denied', 'Brak dostępu do mikrofonu. Zezwól na użycie mikrofonu w ustawieniach przeglądarki (ikona kłódki przy adresie).');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new MicError('notfound', 'Nie znaleziono mikrofonu. Podłącz mikrofon i spróbuj ponownie.');
      throw new MicError('other', `Nie udało się uruchomić mikrofonu: ${(e as Error).message}`);
    }
    c.deviceLabel = c.stream.getAudioTracks()[0]?.label || 'Mikrofon';
    try {
      c.vad = await getVad();
      c.vad.reset();
      await c.setupGraph();
    } catch (e) {
      c.stream.getTracks().forEach((t) => t.stop());
      throw e instanceof MicError ? e : new MicError('other', `Błąd inicjalizacji audio: ${(e as Error).message}`);
    }
    c.recorder = new AudioRecorder(c.stream);
    c.recorder.start();
    if (o.captions && o.onCaption) {
      c.captions = new LiveCaptions(o.onCaption);
      c.captions.start();
    }
    return c;
  }

  private async setupGraph() {
    // Chrome/Edge resample the mic into a 16 kHz context; Firefox refuses mixed rates → native rate + worklet resampling.
    try {
      this.ctx = new AudioContext({ sampleRate: SR });
      const src = this.ctx.createMediaStreamSource(this.stream);
      await this.ctx.audioWorklet.addModule(workletUrl);
      this.node = new AudioWorkletNode(this.ctx, 'cv-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
      src.connect(this.node);
    } catch {
      await this.ctx?.close().catch(() => undefined);
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      await this.ctx.audioWorklet.addModule(workletUrl);
      this.node = new AudioWorkletNode(this.ctx, 'cv-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
      src.connect(this.node);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.node.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type === 'pcm') this.onBlock(e.data.pcm as Float32Array);
    };
  }

  private onBlock(block: Float32Array) {
    if (this.stopped) return;
    const startMs = (this.samples / SR) * 1000;
    this.blocks.push(block);
    this.samples += block.length;
    this.fx.push(block, (f) => this.live.pushFrame(f));
    // VAD inference is async – chain to keep ordering.
    this.vadChain = this.vadChain.then(async () => {
      const p = await this.vad.process(block);
      this.live.pushVad(p, startMs);
      const now = startMs + VAD_FRAME_MS;
      {
        const segs = this.live.vad.segments;
        const out = this.planner.update(segs, this.live.vad.speaking ? this.live.vad.speechStartMs : null, now, false);
        for (const c of out) {
          this.chunks.push(c);
          this.o.onChunk?.(c);
        }
      }
      if (this.o.onLongSilence && !this.silenceFired && !this.live.vad.speaking) {
        const last = this.live.vad.segments[this.live.vad.segments.length - 1];
        if (last && now - last.endMs >= (this.o.silenceStopMs ?? 3000)) {
          this.silenceFired = true;
          this.o.onLongSilence();
        }
      }
      if (this.live.vad.speaking) this.silenceFired = false;
    });
    const t = performance.now();
    if (this.o.onStats && t - this.lastStats > 100) {
      this.lastStats = t;
      this.o.onStats(this.live.stats());
    }
  }

  get durationMs() {
    return (this.samples / SR) * 1000;
  }

  /** PCM slice [startMs, endMs) of the current recording. */
  pcm(startMs = 0, endMs = this.durationMs): Float32Array {
    const a = Math.max(0, Math.floor((startMs / 1000) * SR));
    const b = Math.min(this.samples, Math.ceil((endMs / 1000) * SR));
    const out = new Float32Array(Math.max(0, b - a));
    let pos = 0;
    for (const blk of this.blocks) {
      const s = pos;
      const e = pos + blk.length;
      pos = e;
      if (e <= a) continue;
      if (s >= b) break;
      const from = Math.max(a, s);
      const to = Math.min(b, e);
      out.set(blk.subarray(from - s, to - s), from - a);
    }
    return out;
  }

  async stop(): Promise<CaptureResult> {
    this.stopped = true;
    this.captions?.stop();
    const blob = await this.recorder.stop();
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.stream.getTracks().forEach((t) => t.stop());
    await this.ctx.close().catch(() => undefined);
    await this.vadChain;
    const dur = this.durationMs;
    const speech = this.live.vad.close(dur);
    const last = this.planner.update(speech, null, dur, true);
    for (const c of last) {
      this.chunks.push(c);
      this.o.onChunk?.(c);
    }
    const stats = this.live.stats();
    return {
      pcm: this.pcm(),
      blob,
      mimeType: blob.type,
      db: Float32Array.from(this.live.db),
      voicing: Float32Array.from(this.live.voicing),
      speech: [...speech],
      nuclei: [...this.live.nuclei],
      noiseFloorDb: this.live.noiseFloorDb,
      durationMs: dur,
      chunks: [...this.chunks],
      deviceLabel: this.deviceLabel,
      clipping: stats.clipping,
    };
  }

  async cancel() {
    this.stopped = true;
    this.captions?.stop();
    await this.recorder?.stop().catch(() => undefined);
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => undefined);
  }
}
