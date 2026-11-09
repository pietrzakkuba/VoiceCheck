import type { ModelTier } from '@/types';

export const CTC_REPO = 'XDcobra/wav2vec2-large-xlsr-53-polish-ONNX';

export interface TierConfig {
  tier: ModelTier;
  label: string;
  whisper: string;
  ctc: boolean;
  /** Approximate download in MB (for the consent dialog). */
  sizeMb: { webgpu: number; wasm: number };
  description: string;
}

export const TIERS: Record<ModelTier, TierConfig> = {
  lite: {
    tier: 'lite', label: 'Lite', whisper: 'onnx-community/whisper-base', ctc: false,
    sizeMb: { webgpu: 130, wasm: 80 },
    description: 'Whisper base – tylko transkrypcja, tempo, pauzy i wypełniacze. Bez oceny głosek.',
  },
  standard: {
    tier: 'standard', label: 'Standard', whisper: 'onnx-community/whisper-small', ctc: true,
    sizeMb: { webgpu: 820, wasm: 620 },
    description: 'Whisper small + polski model akustyczny wav2vec2 (int8) – pełna ocena dykcji.',
  },
  pro: {
    tier: 'pro', label: 'Pro', whisper: 'onnx-community/whisper-large-v3-turbo', ctc: true,
    sizeMb: { webgpu: 1900, wasm: 1300 },
    description: 'Whisper large-v3-turbo + wav2vec2 (fp16) – najlepsza jakość, wymaga mocnego GPU.',
  },
};

export interface DeviceInfo {
  webgpu: boolean;
  shaderF16: boolean;
  memoryGb: number;
}

export async function detectDevice(): Promise<DeviceInfo> {
  let webgpu = false;
  let shaderF16 = false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
    const adapter = gpu ? await gpu.requestAdapter() : null;
    if (adapter) {
      webgpu = true;
      shaderF16 = adapter.features.has('shader-f16');
    }
  } catch {
    /* no WebGPU */
  }
  const memoryGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return { webgpu, shaderF16, memoryGb };
}

/** 'auto' tier selection (2.): GPU + ≥8 GB → standard on WebGPU, else standard on WASM if ≥8 GB, else lite. Pro is manual. */
export function resolveTier(setting: 'auto' | ModelTier, dev: DeviceInfo): ModelTier {
  if (setting !== 'auto') return setting;
  // deviceMemory is capped at 8 by browsers.
  if (dev.memoryGb >= 8) return 'standard';
  return 'lite';
}

export function tierSizeMb(tier: ModelTier, dev: DeviceInfo) {
  return dev.webgpu ? TIERS[tier].sizeMb.webgpu : TIERS[tier].sizeMb.wasm;
}

// ---- Worker protocol ----

export interface LoadRequest {
  tier: ModelTier;
  device: DeviceInfo;
  baseUrl: string;
}

export interface ProgressEvent {
  file: string;
  loaded: number;
  total: number;
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready';
}

export type WorkerEvent =
  | { event: 'progress'; files: Record<string, { loaded: number; total: number; done: boolean }> }
  | { event: 'ready'; tier: ModelTier; backend: string; ctc: boolean }
  | { event: 'error'; message: string };
