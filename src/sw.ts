/// <reference lib="webworker" />
import { PrecacheController, type PrecacheEntry } from 'workbox-precaching';
import { allPrecached, handleOfflineFirst } from './lib/pwa-worker';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const precache = new PrecacheController({ cacheName: 'voicecheck-offline' });
precache.addToCacheList(self.__WB_MANIFEST);

self.addEventListener('install', (event) => {
  event.waitUntil(precache.install(event));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(precache.activate(event));
});

async function offlineReady(): Promise<boolean> {
  const cache = await caches.open(precache.strategy.cacheName);
  return allPrecached(precache.getURLsToCacheKeys().values(), async (key) => Boolean(await cache.match(key)));
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'GET_OFFLINE_STATUS') {
    const port = event.ports[0];
    event.waitUntil(offlineReady()
      .catch(() => false)
      .then((ready) => port?.postMessage({ type: 'OFFLINE_STATUS', ready })));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || (request.cache === 'only-if-cached' && request.mode !== 'same-origin')) return;
  event.respondWith(handleOfflineFirst(request, {
    scope: self.registration.scope,
    fetchResponse: (input) => fetch(input),
    precached: (url) => precache.matchPrecache(url),
  }));
});
