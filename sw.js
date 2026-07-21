/**
 * Šmírka Mobile Service Worker
 * Strategy: cache-first for all app assets, network-first for external resources.
 * This enables:
 *   - Full offline use after first load
 *   - Browser "Add to Home Screen" / install prompt on Android/Chrome
 */

'use strict';

const CACHE_NAME = 'smirka-v4'; // bumped: takeoff-type role matching, preset search fix, tow-slot filter fix, bulk preset actions

// All files that make up the app shell — cached on install
const PRECACHE_FILES = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './sw.js',
  './klubko-api.js',
];

/* ---------- INSTALL ---------- */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_FILES))
      .then(() => self.skipWaiting())   // activate immediately, don't wait for old SW to die
  );
});

/* ---------- ACTIVATE ---------- */
self.addEventListener('activate', event => {
  // Delete any old cache versions
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())  // take control of all open tabs immediately
  );
});

/* ---------- FETCH ---------- */
self.addEventListener('fetch', event => {
  // Only intercept same-origin GET requests (don't break Google Fonts, CDNs, etc.)
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately, but revalidate in background
        fetch(event.request).then(response => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      // Not in cache yet — fetch from network and cache the result
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => undefined);
    })
  );
});
