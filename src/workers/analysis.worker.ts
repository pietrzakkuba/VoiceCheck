/// <reference lib="webworker" />
import { AutoModelForCTC, env, pipeline, Tensor, type AutomaticSpeechRecognitionPipeline, type PreTrainedModel } from '@huggingface/transformers';
import { alignWords, logSoftmax, stitchPosteriors, type CtcPosteriors } from '@/engine/ctcAlign';
import { yinTrack } from '@/engine/pitch';
import { mfccDeltaTrack } from '@/engine/mfcc';
import { T } from '@/engine/thresholds';
import { SR } from '@/engine/features';
import { CTC_REPO, TIERS, type LoadRequest, type WorkerEvent } from './models';

declare const self: DedicatedWorkerGlobalScope;

env.allowLocalModels = false;
env.useBrowserCache = true;

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let ctc: PreTrainedModel | null = null;
let vocab: string[] = [];
let loading: Promise<void> | null = null;
let loadedTier: string | null = null;

const files: Record<string, { loaded: number; total: number; done: boolean }> = {};
let lastEmit = 0;

function post(ev: WorkerEvent) {
  self.postMessage(ev);
}

function onProgress(p: { status: string; file?: string; name?: string; loaded?: number; total?: number }) {
  if (!p.file) return;
  const key = `${p.name ?? ''}/${p.file}`;
  const f = (files[key] ??= { loaded: 0, total: 0, done: false });
  if (p.status === 'progress') {
    f.loaded = p.loaded ?? f.loaded;
    f.total = p.total ?? f.total;
  } else if (p.status === 'done') {
    f.done = true;
    if (f.total) f.loaded = f.total;
  }
  const now = performance.now();
  if (now - lastEmit > 200 || p.status === 'done') {
    lastEmit = now;
    post({ event: 'progress', files: { ...files } });
  }
}

async function fetchVocab(): Promise<string[]> {
  const url = `${env.remoteHost.replace(/\/$/, '')}/${CTC_REPO}/resolve/main/vocab.json`;
  let res: Response | undefined;
  try {
    const cache = await caches.open('transformers-cache');
    res = await cache.match(url);
    if (!res) {
      res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
    }
  } catch {
    res = await fetch(url);
  }
  const map = (await res!.json()) as Record<string, number>;
  const out: string[] = [];
  for (const [tok, id] of Object.entries(map)) out[id] = tok;
  return out;
}

async function load(req: LoadRequest) {
  const cfg = TIERS[req.tier];
  const wasm = env.backends.onnx.wasm!;
  wasm.wasmPaths = `${req.baseUrl}vendor/tf/`;
  wasm.numThreads = self.crossOriginIsolated ? Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1)) : 1;

  const gpu = req.device.webgpu;
  const turbo = cfg.whisper.includes('turbo');
  const whisperOpts = gpu
    ? { device: 'webgpu' as const, dtype: { encoder_model: (turbo && req.device.shaderF16 ? 'fp16' : 'fp32') as 'fp16' | 'fp32', decoder_model_merged: 'q4' as const } }
    : { device: 'wasm' as const, dtype: { encoder_model: 'q8' as const, decoder_model_merged: 'q8' as const } };

  const makePipeline = pipeline as unknown as (task: string, model: string, opts: object) => Promise<unknown>;
  asr = (await makePipeline('automatic-speech-recognition', cfg.whisper, {
    ...whisperOpts,
    progress_callback: onProgress,
  })) as AutomaticSpeechRecognitionPipeline;

  let backend = gpu ? 'WebGPU' : 'WASM';
  if (cfg.ctc) {
    vocab = await fetchVocab();
    const ctcGpu = req.tier === 'pro' && gpu && req.device.shaderF16;
    ctc = await AutoModelForCTC.from_pretrained(CTC_REPO, {
      device: ctcGpu ? 'webgpu' : 'wasm',
      dtype: ctcGpu ? 'fp16' : 'int8',
      progress_callback: onProgress as never,
    });
    backend += ctcGpu ? ' + CTC WebGPU' : ' + CTC WASM';
  }
  loadedTier = req.tier;
  post({ event: 'ready', tier: req.tier, backend, ctc: !!ctc });
}

async function transcribe(pcm: Float32Array): Promise<string> {
  if (!asr) throw new Error('ASR not loaded');
  const out = (await asr(pcm, { language: 'polish', task: 'transcribe', return_timestamps: false, chunk_length_s: 30 } as never)) as { text: string } | { text: string }[];
  return (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text).trim();
}

/** Zero-mean / unit-variance normalization (Wav2Vec2FeatureExtractor do_normalize). */
function normalize(x: Float32Array): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m += x[i];
  m /= x.length || 1;
  let v = 0;
  for (let i = 0; i < x.length; i++) v += (x[i] - m) ** 2;
  const sd = Math.sqrt(v / (x.length || 1) + 1e-7);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = (x[i] - m) / sd;
  return out;
}

async function ctcLogits(pcm: Float32Array): Promise<{ lp: Float32Array; T: number; V: number }> {
  const x = normalize(pcm);
  const input_values = new Tensor('float32', x, [1, x.length]);
  const attention_mask = new Tensor('int64', new BigInt64Array(x.length).fill(1n), [1, x.length]);
  const out = (await ctc!({ input_values, attention_mask })) as { logits: Tensor };
  const [, Tn, V] = out.logits.dims as number[];
  const data = out.logits.data as Float32Array;
  return { lp: logSoftmax(data instanceof Float32Array ? data : Float32Array.from(data as ArrayLike<number>), Tn, V), T: Tn, V };
}

async function posteriors(pcm: Float32Array): Promise<CtcPosteriors> {
  const maxN = Math.round((T.ctcMaxChunkMs / 1000) * SR);
  const ovN = Math.round((T.ctcOverlapMs / 1000) * SR);
  const blankId = Math.max(0, vocab.indexOf('<pad>'));
  if (pcm.length <= maxN) {
    const r = await ctcLogits(pcm);
    return { lp: r.lp, T: r.T, V: r.V, frameMs: (pcm.length / SR) * 1000 / r.T, vocab, blankId };
  }
  const pieces: { lp: Float32Array; T: number }[] = [];
  let V = 0;
  let frameMs = 20;
  for (let s = 0; s < pcm.length; s += maxN - ovN) {
    const part = pcm.subarray(s, Math.min(pcm.length, s + maxN));
    if (part.length < SR * 0.2 && pieces.length) break;
    const r = await ctcLogits(part);
    V = r.V;
    frameMs = (part.length / SR) * 1000 / r.T;
    pieces.push({ lp: r.lp, T: r.T });
    if (s + maxN >= pcm.length) break;
  }
  const st = stitchPosteriors(pieces, V, Math.round(T.ctcOverlapMs / frameMs));
  return { lp: st.lp, T: st.T, V, frameMs: (pcm.length / SR) * 1000 / st.T, vocab, blankId };
}

type Req =
  | { id: number; method: 'load'; args: LoadRequest }
  | { id: number; method: 'transcribe'; args: { pcm: Float32Array } }
  | { id: number; method: 'align'; args: { pcm: Float32Array; words: string[]; offsetMs: number } }
  | { id: number; method: 'acoustics'; args: { pcm: Float32Array; minDb: number } };

self.onmessage = async (e: MessageEvent<Req>) => {
  const { id, method, args } = e.data;
  try {
    let result: unknown;
    switch (method) {
      case 'load':
        if (loadedTier !== args.tier) {
          loading = load(args);
        }
        await loading;
        result = true;
        break;
      case 'transcribe':
        result = await transcribe(args.pcm);
        break;
      case 'align': {
        if (!ctc) { result = null; break; }
        const post = await posteriors(args.pcm);
        result = args.words.length ? alignWords(post, args.words, args.offsetMs) : null;
        break;
      }
      case 'acoustics': {
        const f0 = yinTrack(args.pcm, args.minDb);
        const mfccDelta = mfccDeltaTrack(args.pcm);
        self.postMessage({ id, result: { f0, mfccDelta } }, [f0.buffer, mfccDelta.buffer]);
        return;
      }
    }
    self.postMessage({ id, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (method === 'load') { loadedTier = null; post({ event: 'error', message }); }
    self.postMessage({ id, error: message });
  }
};
