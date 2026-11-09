/// <reference lib="webworker" />
import { PrecacheController, type PrecacheEntry } from 'workbox-precaching';
import { fetchWithOffline } from './lib/pwa-worker';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

const precache = new PrecacheController({ cacheName: 'voicecheck-offline' });
// Track the app entry's revision for updates, but keep only the offline document in cache.
precache.addToCacheList(self.__WB_MANIFEST.filter((entry) => (
  typeof entry === 'string' || entry.url !== 'index.html'
)));

self.addEventListener('install', (event) => {
  event.waitUntil(precache.install(event));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(precache.activate(event));
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || (request.cache === 'only-if-cached' && request.mode !== 'same-origin')) return;
  event.respondWith(fetchWithOffline(
    request,
    (input) => fetch(input),
    () => precache.matchPrecache(new URL('offline.html', self.registration.scope).href),
  ));
});
