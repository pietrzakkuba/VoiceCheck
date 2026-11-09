// Copies runtime assets (Silero VAD model, ONNX Runtime WASM) into public/.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const out = join(root, 'public', 'vendor');
mkdirSync(out, { recursive: true });

function copy(from, to) {
  if (!existsSync(from)) {
    console.warn(`[copy-assets] missing: ${from}`);
    return;
  }
  cpSync(from, to);
}

copy(join(nm, '@ricky0123', 'vad-web', 'dist', 'silero_vad_v5.onnx'), join(out, 'silero_vad_v5.onnx'));

const ortDist = join(nm, 'onnxruntime-web', 'dist');
if (existsSync(ortDist)) {
  for (const f of readdirSync(ortDist)) {
    if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)) copy(join(ortDist, f), join(out, f));
  }
}

console.log('[copy-assets] done');
