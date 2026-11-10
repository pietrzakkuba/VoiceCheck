import { describe, expect, it, vi } from 'vitest';
import { allPrecached, fetchWithOffline, handleOfflineFirst, withIsolation } from './pwa-worker';

function navigation() {
  const request = new Request('https://voicecheck.test/presentations/123/rehearse');
  Object.defineProperty(request, 'mode', { value: 'navigate' });
  return request;
}

describe('PWA response handling', () => {
  it('preserves content, status and headers while adding isolation', async () => {
    const response = withIsolation(new Response('audio', { status: 206, headers: { 'Content-Type': 'audio/webm' } }));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('audio/webm');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(await response.text()).toBe('audio');
  });

  it('does not reconstruct opaque or error responses', () => {
    const opaque = Response.error();
    expect(withIsolation(opaque)).toBe(opaque);
  });

  it('uses the offline document for a failed deep-link navigation', async () => {
    const response = await fetchWithOffline(
      navigation(),
      vi.fn().mockRejectedValue(new TypeError('offline')),
      vi.fn().mockResolvedValue(new Response('offline document')),
    );
    expect(await response.text()).toBe('offline document');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
  });

  it.each([404, 500, 503])('preserves HTTP %i instead of disguising it as offline', async (status) => {
    const fallback = vi.fn();
    const response = await fetchWithOffline(navigation(), async () => new Response('server error', { status }), fallback);
    expect(response.status).toBe(status);
    expect(fallback).not.toHaveBeenCalled();
  });

  it('does not return HTML for failed model, module or audio requests', async () => {
    const fallback = vi.fn();
    await expect(fetchWithOffline(
      new Request('https://voicecheck.test/vendor/model.onnx'),
      vi.fn().mockRejectedValue(new Error('offline')),
      fallback,
    )).rejects.toThrow('offline');
    expect(fallback).not.toHaveBeenCalled();
  });

  it('surfaces the original network failure when the fallback is missing', async () => {
    await expect(fetchWithOffline(
      navigation(),
      vi.fn().mockRejectedValue(new Error('offline')),
      async () => undefined,
    )).rejects.toThrow('offline');
  });
});

describe('offline-first routing', () => {
  const scope = 'https://voicecheck.test/';
  const files: Record<string, string> = {
    'https://voicecheck.test/index.html': 'app shell',
    'https://voicecheck.test/offline.html': 'offline document',
    'https://voicecheck.test/vendor/silero_vad_v5.onnx': 'model',
  };
  const precached = async (url: string) => (url in files ? new Response(files[url]) : undefined);

  it('serves precached files from cache without the network', async () => {
    const fetchResponse = vi.fn();
    const response = await handleOfflineFirst(
      new Request('https://voicecheck.test/vendor/silero_vad_v5.onnx'),
      { scope, fetchResponse, precached },
    );
    expect(await response.text()).toBe('model');
    expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(fetchResponse).not.toHaveBeenCalled();
  });

  it('opens any in-scope page from the cached app shell', async () => {
    const fetchResponse = vi.fn();
    const response = await handleOfflineFirst(navigation(), { scope, fetchResponse, precached });
    expect(await response.text()).toBe('app shell');
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(fetchResponse).not.toHaveBeenCalled();
  });

  it('uses the network for files that are not precached', async () => {
    const fetchResponse = vi.fn().mockResolvedValue(new Response('fresh'));
    const response = await handleOfflineFirst(
      new Request('https://voicecheck.test/other.json'),
      { scope, fetchResponse, precached },
    );
    expect(await response.text()).toBe('fresh');
  });

  it('falls back to the network and then the offline document without a cached shell', async () => {
    const only = async (url: string) => (url.endsWith('offline.html') ? new Response('offline document') : undefined);
    const response = await handleOfflineFirst(navigation(), {
      scope, fetchResponse: vi.fn().mockRejectedValue(new TypeError('offline')), precached: only,
    });
    expect(await response.text()).toBe('offline document');
  });

  it('reports readiness only when every precached file is present', async () => {
    expect(await allPrecached(['a', 'b'], async () => true)).toBe(true);
    expect(await allPrecached(['a', 'b'], async (key) => key === 'a')).toBe(false);
    expect(await allPrecached([], async () => true)).toBe(false);
  });
});
