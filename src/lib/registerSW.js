// Service worker registration for the offline shell.
// Registers /OneSignalSDKWorker.js at root scope (/) so it controls the
// entire app and can serve the offline shell on navigation requests. This
// runs independently of OneSignal's push SDK — the SW is registered even when
// push is disabled or permission is not granted, so the offline shell is
// always available to authenticated users.
//
// The registration is idempotent: if a SW is already controlling the page
// (e.g. OneSignal registered it), we don't re-register — we just ensure one
// exists at root scope. If the existing registration is at a different scope,
// we register ours at root scope (they coexist without conflict).

export async function registerOfflineSW() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const SW_URL = '/OneSignalSDKWorker.js';
  const SW_SCOPE = '/';

  try {
    // Check if a controller is already active at root scope
    if (navigator.serviceWorker.controller) {
      // A SW is already controlling the page. Verify it's ours (or OneSignal's
      // at root scope — same file, same scope). If so, nothing to do.
      return;
    }

    // Check existing registrations — don't duplicate if ours is already registered
    const existing = await navigator.serviceWorker.getRegistrations();
    for (const reg of existing) {
      if (reg.scope === new URL(SW_SCOPE, window.location.origin).href) {
        // Already registered at root scope — wait for it to become ready.
        return;
      }
    }

    // Register our SW at root scope. This coexists with any OneSignal
    // registration (OneSignal typically uses the same file at the same scope).
    await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch (e) {
    // SW registration failure is non-blocking — the app still works online.
    console.warn('[sw] offline shell registration failed:', e.message || e);
  }
}

// Wait for the service worker to be ready (active controller). Used by the
// ConnectivityIndicator's offline link to avoid navigating into the SPA before
// the SW can intercept the navigation request. Returns a promise that resolves
// to the controller, or null if no controller after a short timeout.
export function waitForSWReady(timeoutMs = 3000) {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      resolve(null);
      return;
    }
    if (navigator.serviceWorker.controller) {
      resolve(navigator.serviceWorker.controller);
      return;
    }
    let resolved = false;
    const done = (val) => { if (!resolved) { resolved = true; resolve(val); } };
    navigator.serviceWorker.addEventListener('controllerchange', () => done(navigator.serviceWorker.controller));
    setTimeout(() => done(navigator.serviceWorker.controller || null), timeoutMs);
  });
}