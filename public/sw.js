/**
 * Murattil AI - Service Worker
 * Strategy: Cache-First for static assets & Quran fonts, Stale-While-Revalidate for app assets.
 */

const CACHE_NAME = 'murattil-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
];

// Install Event: Pre-cache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Smart routing & caching
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') return;

  // 1. Google Fonts Cache (Amiri, Cairo, Scheherazade New)
  if (url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open('murattil-fonts').then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) return cachedResponse;

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return cachedResponse;
        }
      })
    );
    return;
  }

  // 2. Audio recitation files (Network first, then fallback to cache)
  if (url.pathname.endsWith('.mp3') || url.pathname.includes('/audio/')) {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  // 3. App Shell & Static Vite Assets (Stale-While-Revalidate)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});


// Notification Click Event: Focus or Open App
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
