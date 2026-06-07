// sw.js — Service Worker PWA Coach Running v5
// Stratégie : network-first pour tout (pas de cache JS/HTML)
const CACHE_NAME = 'coach-running-v34';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Supprime TOUS les anciens caches
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API, health → réseau pur, jamais de cache
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    event.respondWith(fetch(event.request));
    return;
  }

  // HTML, JS, CSS → network-first : essaie le réseau, fallback cache
  // Ça garantit que tu as toujours la dernière version si en ligne
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
