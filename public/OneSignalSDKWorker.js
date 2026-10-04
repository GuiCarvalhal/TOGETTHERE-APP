// OneSignal Web Push service worker + TOGETTHERE offline read-only cache.
// The Web SDK looks for this file at the site root: /OneSignalSDKWorker.js
// It must be served with content-type: application/javascript from the app origin.
//
// OneSignal registers push/subscription/notificationclick handlers only.
// This file layers app-owned install/activate/fetch handlers on top for
// offline app-shell caching. Both coexist in the same global scope — OneSignal
// never calls respondWith on fetch, so there is no conflict.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// ─── TOGETTHERE offline read-only shell cache ─────────────────────
// Caches only same-origin public app shell + static assets for offline
// consultation. NEVER caches API/auth/function responses, tokens, receipts,
// files, or third-party maps. Network-first navigation with /offline.html
// fallback on network failure. Cache is versioned and pruned on activate.

var OFFLINE_CACHE = 'tt-shell-v1';
var OFFLINE_SHELL = '/offline.html';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(function (c) { return c.add(OFFLINE_SHELL); }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== OFFLINE_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Only handle same-origin requests. Third-party (maps, CDN, photos) bypasses.
  if (url.origin !== self.location.origin) return;
  // NEVER cache API/auth/function responses, tokens, receipts, or files.
  if (url.pathname.startsWith('/functions/')) return;
  if (url.pathname.indexOf('/api/') !== -1) return;

  // Navigation requests: network-first, fall back to cached /offline.html.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        // Cache a fresh copy of the app shell for future offline loads.
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(OFFLINE_CACHE).then(function (c) { c.put(req, clone); });
        }
        return res;
      }).catch(function () {
        return caches.match(OFFLINE_SHELL).then(function (cached) {
          return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/html' } });
        });
      })
    );
    return;
  }

  // Static assets (JS, CSS, fonts, images): stale-while-revalidate.
  var isStatic = /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico|map)(\?|$)/.test(url.pathname);
  if (isStatic) {
    event.respondWith(
      caches.match(req).then(function (cached) {
        var fetchPromise = fetch(req).then(function (res) {
          if (res && res.ok) {
            var clone = res.clone();
            caches.open(OFFLINE_CACHE).then(function (c) { c.put(req, clone); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || fetchPromise;
      })
    );
  }
});
