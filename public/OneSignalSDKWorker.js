// OneSignal Web Push service worker + TOGETTHERE offline read-only shell.
// The Web SDK looks for this file at the site root: /OneSignalSDKWorker.js
// It must be served with content-type: application/javascript from the app origin.
//
// OneSignal registers push/subscription/notificationclick handlers only.
// This file layers app-owned install/activate/fetch handlers on top for
// offline app-shell caching. Both coexist in the same global scope — OneSignal
// never calls respondWith on fetch, so there is no conflict.
// We do NOT ask for push permission or handle push events — OneSignal owns those.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// ─── TOGETTHERE offline shell cache ──────────────────────────────
// Caches ONLY the offline shell JS/CSS (precached on install) plus a strict
// allowlist of same-origin static assets (/assets/ + exact public files).
// NEVER caches navigations (except the synthetic /offline.html response),
// API/auth/function responses, tokens, receipts, files, or third-party maps.
// Cache is versioned; activate prunes ONLY tt-shell-* caches (keeps OneSignal).
var OFFLINE_CACHE = 'tt-shell-v2';
var OFFLINE_SHELL_JS = '/offline-shell.js';
var OFFLINE_SHELL_CSS = '/offline-shell.css';
var MAX_ENTRIES = 60;

// Synthetic offline shell HTML — references precached JS/CSS.
// Unique marker: <meta name="tt-offline-shell" content="v2">
function offlineShellHtml() {
  return [
    '<!DOCTYPE html><html lang="en" data-locale="en"><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
    '<meta name="theme-color" content="#0C131D">',
    '<meta name="tt-offline-shell" content="v2">',
    '<title>TOGETTHERE \u2014 Offline Saved Items</title>',
    '<link rel="stylesheet" href="' + OFFLINE_SHELL_CSS + '">',
    '</head><body>',
    '<div class="header"><div class="brand"><span class="brand-dot"></span> TOGETTHERE</div>',
    '<span class="offline-badge">Offline &middot; Read-only</span></div>',
    '<div class="container"><div id="syncInfo" class="sync-info hidden"></div>',
    '<div id="listView"></div><div id="detailView" class="hidden"></div></div>',
    '<div class="footer"><a href="/">Return to app</a> &middot; Cached data may be incomplete.',
    ' Changes made while offline won\u2019t appear here.</div>',
    '<script src="' + OFFLINE_SHELL_JS + '"></script>',
    '</body></html>'
  ].join('');
}

function syntheticShellResponse() {
  return new Response(offlineShellHtml(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    status: 200,
  });
}

// ─── Cache policy (must match src/lib/offlineCache.js shouldCacheUrl) ───
// Allowlist: only these same-origin paths are eligible for caching.
function isCacheablePath(p) {
  if (p.startsWith('/assets/')) return true;
  var EXACT = ['/icon.svg', '/manifest.json', '/offline-shell.js', '/offline-shell.css',
    '/favicon.ico', '/icon-192.png', '/icon-512.png'];
  return EXACT.indexOf(p) !== -1;
}

// Denylist: never cache these (auth, API, tokens, files, receipts).
function isDeniedPath(p, url) {
  if (p.startsWith('/functions/')) return true;
  if (p.indexOf('/api/') !== -1) return true;
  if (p === '/login' || p.startsWith('/login/') ||
      p === '/register' || p.startsWith('/register/') ||
      p === '/forgot-password' || p.startsWith('/forgot-password/') ||
      p === '/reset-password' || p.startsWith('/reset-password/')) return true;
  if (p.startsWith('/auth') || p.startsWith('/callback')) return true;
  if (p.startsWith('/files/') || p.startsWith('/uploads/')) return true;
  if (p.indexOf('receipt') !== -1) return true;
  var q = url.searchParams;
  if (q.has('token') || q.has('code') || q.has('access_token') || q.has('reset_token')) return true;
  return false;
}

// ─── Install: precache offline shell JS/CSS ───────────────────────
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then(function (c) {
      return c.addAll([OFFLINE_SHELL_JS, OFFLINE_SHELL_CSS]);
    }).then(function () { return self.skipWaiting(); })
  );
});

// ─── Activate: prune ONLY tt-shell-* caches, keep OneSignal & others ──
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return typeof k === 'string' && k.indexOf('tt-shell-') === 0 && k !== OFFLINE_CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// LRU-ish trim: remove oldest entries when cache exceeds MAX_ENTRIES.
function trimCache(cache) {
  return cache.keys().then(function (keys) {
    if (keys.length <= MAX_ENTRIES) return;
    return keys.slice(0, keys.length - MAX_ENTRIES).reduce(function (p, key) {
      return p.then(function () { return cache.delete(key); });
    }, Promise.resolve());
  });
}

// ─── Fetch: intercept navigations + allowlisted static only ──────
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: /offline.html → synthetic shell (online too, once controller
  // ready). Other navigations → network-only, fall back to synthetic shell on
  // failure. NEVER cache navigation responses (may contain auth tokens in URL).
  if (req.mode === 'navigate') {
    if (url.pathname === '/offline.html') {
      event.respondWith(syntheticShellResponse());
      return;
    }
    event.respondWith(
      fetch(req).catch(function () { return syntheticShellResponse(); })
    );
    return;
  }

  // Static assets: cache-first for allowlisted paths only.
  if (isDeniedPath(url.pathname, url)) return;
  if (!isCacheablePath(url.pathname)) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      var fetchPromise = fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(OFFLINE_CACHE).then(function (c) {
            c.put(req, clone).then(function () { trimCache(c); });
          });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fetchPromise;
    })
  );
});
