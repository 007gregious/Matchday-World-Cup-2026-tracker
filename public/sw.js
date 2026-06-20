/**
 * App-shell cache for Matchday.
 *
 * Strategy: cache-first for the shell (HTML/CSS/JS/manifest/icon), so a
 * repeat visit can render entirely from cache before any network request
 * completes. /api/* and /healthz always go straight to the network —
 * scores, tables and stats must never be served stale from here.
 *
 * IMPORTANT — if you edit styles.css or app.js and don't see the change
 * after redeploying: bump CACHE_NAME below (v1 -> v2). Browsers only
 * re-run the install step (which re-downloads the shell) when this file's
 * bytes change, so a cache-only edit elsewhere won't trigger a refresh on
 * its own.
 */

const CACHE_NAME = 'matchday-shell-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/flags.js',
  '/manifest.json',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
