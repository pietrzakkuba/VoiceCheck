import { describe, expect, it, vi } from 'vitest';
import { fetchWithOffline, withIsolation } from './pwa-worker';

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
