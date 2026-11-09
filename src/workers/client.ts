import { create } from 'zustand';
import type { AlignedWord, ModelTier } from '@/types';
import { detectDevice, resolveTier, tierSizeMb, type DeviceInfo, type WorkerEvent } from './models';
import { getSettings } from '@/store/settings';

export type ModelStatus = 'idle' | 'needs-consent' | 'loading' | 'ready' | 'error';

interface ModelState {
  status: ModelStatus;
  tier: ModelTier | null;
  backend: string;
  ctc: boolean;
  device: DeviceInfo | null;
  loadedMb: number;
  totalMb: number;
  error: string | null;
  expectedMb: number;
}

export const useModelStore = create<ModelState>(() => ({
  status: 'idle', tier: null, backend: '', ctc: false, device: null, loadedMb: 0, totalMb: 0, error: null, expectedMb: 0,
}));

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const readyWaiters: (() => void)[] = [];

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent) => {
    const d = e.data as WorkerEvent | { id: number; result?: unknown; error?: string };
    if ('event' in d) {
      if (d.event === 'progress') {
        let loaded = 0;
        let total = 0;
        for (const f of Object.values(d.files)) { loaded += f.loaded; total += f.total; }
        useModelStore.setState({ loadedMb: loaded / 1e6, totalMb: total / 1e6 });
      } else if (d.event === 'ready') {
        useModelStore.setState({ status: 'ready', tier: d.tier, backend: d.backend, ctc: d.ctc, error: null });
        readyWaiters.splice(0).forEach((r) => r());
      } else if (d.event === 'error') {
        useModelStore.setState({ status: 'error', error: d.message });
      }
      return;
    }
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.error) p.reject(new Error(d.error));
    else p.resolve(d.result);
  };
  worker.onerror = (e) => useModelStore.setState({ status: 'error', error: e.message || 'Błąd workera' });
  return worker;
}

function call<R>(method: string, args: unknown, transfer: Transferable[] = []): Promise<R> {
  const w = getWorker();
  const id = nextId++;
  return new Promise<R>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, method, args }, transfer);
  });
}

/** Decides the tier and either starts loading (consent given) or asks for consent. */
export async function initModels() {
  const s = getSettings();
  const device = useModelStore.getState().device ?? (await detectDevice());
  const tier = resolveTier(s.modelTier, device);
  useModelStore.setState({ device, expectedMb: tierSizeMb(tier, device) });
  if (useModelStore.getState().status === 'ready' && useModelStore.getState().tier === tier) return;
  if (!s.modelConsent) {
    useModelStore.setState({ status: 'needs-consent', tier });
    return;
  }
  await loadModels(tier, device);
}

export async function loadModels(tier: ModelTier, device?: DeviceInfo) {
  const dev = device ?? useModelStore.getState().device ?? (await detectDevice());
  useModelStore.setState({ status: 'loading', tier, device: dev, loadedMb: 0, totalMb: 0, error: null, expectedMb: tierSizeMb(tier, dev) });
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
  const baseUrl = new URL(import.meta.env.BASE_URL, location.href).href;
  try {
    await call('load', { tier, device: dev, baseUrl });
  } catch (e) {
    useModelStore.setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
  }
}

export function modelsReady() {
  return useModelStore.getState().status === 'ready';
}

export function whenModelsReady(): Promise<void> {
  if (modelsReady()) return Promise.resolve();
  return new Promise((r) => readyWaiters.push(r));
}

export const analysisClient = {
  transcribe: (pcm: Float32Array) => call<string>('transcribe', { pcm }),
  align: (pcm: Float32Array, words: string[], offsetMs: number) => call<AlignedWord[] | null>('align', { pcm, words, offsetMs }),
  acoustics: (pcm: Float32Array, minDb: number) => call<{ f0: Float32Array; mfccDelta: Float32Array }>('acoustics', { pcm, minDb }),
};
