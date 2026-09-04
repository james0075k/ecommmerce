/**
 * Bazaar service worker.
 *
 * Hand-written rather than generated. The two usual options do not fit this
 * app: next-pwa has not been updated for the App Router era, and @serwist/next
 * injects through a webpack plugin, which Next 16 does not run when the build
 * goes through Turbopack. What is left - a precache list, three routing rules
 * and a size cap - is small enough to read in one sitting and has no build step
 * that can silently stop running.
 *
 * Strategies, by request type:
 *
 *   navigation      network first, then the cached page, then /offline
 *   /_next/static   cache first (content-hashed, so it can never go stale)
 *   images          stale while revalidate, capped at 60 entries
 *   catalogue API   stale while revalidate, capped at 40 entries
 *   everything else network, falling back to whatever is cached
 */

const VERSION = 'v1';
const PRECACHE = `bazaar-precache-${VERSION}`;
const PAGES = `bazaar-pages-${VERSION}`;
const ASSETS = `bazaar-assets-${VERSION}`;
const IMAGES = `bazaar-images-${VERSION}`;
const DATA = `bazaar-data-${VERSION}`;

const OFFLINE_URL = '/offline';

/** Kept small on purpose: a shopper's phone is not a CDN. */
const LIMITS = { [PAGES]: 30, [IMAGES]: 60, [DATA]: 40, [ASSETS]: 80 };

const PRECACHE_URLS = [OFFLINE_URL, '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PRECACHE);
      // Individually, so one 404 during a deploy does not fail the whole
      // install and leave the worker permanently unactivated.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('bazaar-') && !key.endsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') void self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that changes state must reach the server. A cached POST is a lost
  // order.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  // Auth and cart are per-session and must never be served from a shared cache.
  if (/\/(auth|cart|orders|payments|wishlist|users)(\/|$)/.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (
    request.destination === 'image' ||
    (url.origin === self.location.origin && url.pathname.startsWith('/_next/image'))
  ) {
    event.respondWith(staleWhileRevalidate(request, IMAGES));
    return;
  }

  // The catalogue, so an offline visit can still browse what has been seen.
  if (/\/(products|categories|search)(\/|\?|$)/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, DATA));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, ASSETS));
  }
});

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      void trim(PAGES);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL, { cacheName: PRECACHE });
    return (
      offline ??
      new Response('<h1>You are offline</h1>', {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request, { cacheName });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    void trim(cacheName);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      // `basic` and `cors` only - an opaque response has status 0, and caching
      // it would pin a failure that cannot be inspected.
      if (response.ok && response.type !== 'opaque') {
        await cache.put(request, response.clone());
        void trim(cacheName);
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    // Refresh in the background; the shopper gets the cached copy now.
    void network;
    return cached;
  }

  const response = await network;
  return response ?? Response.error();
}

/** Evicts oldest-first once a cache passes its limit. */
async function trim(cacheName) {
  const limit = LIMITS[cacheName];
  if (!limit) return;

  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;

  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}
