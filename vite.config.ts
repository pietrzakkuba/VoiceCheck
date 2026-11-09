/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';

// SharedArrayBuffer (multi-threaded WASM) requires cross-origin isolation.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: false,
      injectManifest: {
        // index.html revisions make UI-only deployments detectable without caching the app.
        globPatterns: ['offline.html', 'index.html'],
      },
      includeManifestIcons: false,
      manifest: {
        id: '/',
        name: 'VoiceCheck',
        short_name: 'VoiceCheck',
        description: 'Trener wystąpień i prezentacji po polsku.',
        lang: 'pl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#7a2436',
        background_color: '#fbf7ef',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000 },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
