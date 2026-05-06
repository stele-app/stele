/**
 * Stele web viewer service worker.
 *
 * Caching strategy:
 * - Same-origin static assets (HTML, JS, CSS, vendor UMDs, wasm, icons):
 *   cache-first with network fallback. Vite hashes the JS bundle so new
 *   deploys naturally invalidate the cache on next load.
 * - Navigation requests (HTML pages): network-first, cache fallback. Ensures
 *   users always get the latest app shell when online.
 * - Artifact fetches (cross-origin, or /fetch?url=…): NEVER cached. Privacy
 *   principle — the runtime hosts nothing that isn't its own bundle.
 */

const CACHE_NAME = 'stele-app-v2';

self.addEventListener('install', (event) => {
  // Take over as soon as the new SW is ready.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll([
        '/',
        '/manifest.webmanifest',
        '/icon-128.png',
      ]).catch(() => {
        // Pre-cache failures shouldn't block SW activation; runtime fetch
        // will populate the cache on first use.
      }),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Drop old cache versions.
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin) return; // Never cache cross-origin (artifacts, proxy, server.fetch).

  // Never cache artifact-proxy responses either — these are user content.
  if (url.pathname.startsWith('/fetch')) return;

  // Navigation requests: network-first so users get shell updates.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(req);
        return cached ?? caches.match('/') ?? Response.error();
      }
    })());
    return;
  }

  // Static assets: cache-first, populate on miss.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      return Response.error();
    }
  })());
});
