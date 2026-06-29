/* Flow Planner — Service Worker
   v2.2 (cache bumped after modular refactor) */
const CACHE_NAME = 'flow-planner-v2-2';

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './js/app.js',
  './supabase.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // Network-first for navigation requests (so HTML updates land quickly),
  // cache-first for static assets, with offline fallback.
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(res => res || fetch(req).then(networkRes => {
      // Cache same-origin GETs opportunistically.
      if (req.method === 'GET' && new URL(req.url).origin === self.location.origin) {
        const clone = networkRes.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone)).catch(()=>{});
      }
      return networkRes;
    }).catch(() => caches.match('./index.html')))
  );
});
