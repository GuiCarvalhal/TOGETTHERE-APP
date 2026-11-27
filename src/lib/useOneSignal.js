import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { DEVICE_STATE, deriveDeviceState, detectPushCapability } from '@/lib/notificationDeviceState';

// Client-side OneSignal Web SDK hook. Initializes with the App ID (fetched
// server-side via getOneSignalConfig — the REST API key never reaches the
// client), associates the device with the Base44 user id, and exposes the REAL
// subscription state of this device.
//
// The device switch reads OneSignal's own subscription intent, not a local
// permission snapshot: on iOS the browser permission and the `subscribed` flag
// both lag behind a grant (the Apple token registers later), which left the
// switch disabled or stuck OFF after a reinstall. No secrets are stored or
// exposed.

// How long to wait for the SDK's deferred callback before falling back to the
// browser APIs. Without this a blocked/slow SDK left `ready` false forever and
// the switch permanently disabled.
const SDK_WAIT_MS = 4000;
// Delayed re-reads after a toggle: the subscription id/token can arrive seconds
// after optIn, and iOS often only settles once the app is focused again.
const RECONCILE_MS = [1000, 4000, 10000];

// OneSignal v16 exposes the raw permission as `permissionNative` (string) and
// `permission` (boolean). Prefer the SDK's own view, then the browser's.
function readPermission(OS) {
  const native = OS?.Notifications?.permissionNative;
  if (typeof native === 'string' && native) return native;
  const flag = OS?.Notifications?.permission;
  if (typeof flag === 'boolean') return flag ? 'granted' : 'default';
  if (typeof Notification !== 'undefined') return Notification.permission;
  return 'denied';
}

function readSubscription(OS) {
  const sub = OS?.User?.PushSubscription;
  return {
    permission: readPermission(OS),
    optedIn: typeof sub?.optedIn === 'boolean' ? sub.optedIn : null,
    subscribed: typeof sub?.subscribed === 'boolean' ? sub.subscribed : null,
  };
}

function detectEnv() {
  if (typeof window === 'undefined') {
    return { hasNotification: false, hasServiceWorker: false, ios: false, standalone: false };
  }
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true
    || (typeof window.matchMedia === 'function'
      && window.matchMedia('(display-mode: standalone)').matches);
  return {
    hasNotification: 'Notification' in window,
    hasServiceWorker: 'serviceWorker' in navigator,
    ios,
    standalone,
  };
}

// The SDK flips its subscription flags asynchronously after optIn/optOut, so a
// toggle waits for the real value instead of reading a stale snapshot.
async function waitFor(check, timeout = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return check();
}

export function useOneSignal(userId) {
  const [capability, setCapability] = useState({
    supported: false,
    status: DEVICE_STATE.UNSUPPORTED,
  });
  const [configured, setConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [sub, setSub] = useState({ permission: 'default', optedIn: null, subscribed: null });
  const mounted = useRef(true);
  const wired = useRef(false);

  const sync = useCallback(() => {
    if (!mounted.current) return;
    setSub(readSubscription(window._ttOneSignal));
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Capability is decided from the environment itself, before any network call,
  // so a failed config fetch can never present the device as unsupported.
  useEffect(() => {
    setCapability(detectPushCapability(detectEnv()));
  }, []);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let cancelled = false;
    let sdkTimer = null;
    (async () => {
      try {
        const res = await base44.functions.invoke('getOneSignalConfig');
        const cfg = res.data || res;
        if (cancelled) return;
        setConfigured(Boolean(cfg.configured && cfg.appId));
        if (!cfg.configured || !cfg.appId) return;

        if (typeof window.OneSignalDeferred === 'undefined') window.OneSignalDeferred = [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          if (cancelled) return;
          if (sdkTimer) clearTimeout(sdkTimer);
          try {
            await OneSignal.init({ appId: cfg.appId, allowLocalhostAsSecureOrigin: true });
            await OneSignal.login(userId);
            window._ttOneSignal = OneSignal;
            if (!wired.current) {
              // Keep the switch in step with the browser and the subscription.
              OneSignal.User.PushSubscription.addEventListener('change', sync);
              OneSignal.Notifications.addEventListener('permissionChange', sync);
              OneSignal.Notifications.addEventListener('click', (event) => {
                try {
                  const data = event?.notification?.data || event?.data || {};
                  if (data.route) window.location.href = data.route;
                } catch { /* ignore */ }
              });
              wired.current = true;
            }
            setReady(true);
            sync();
          } catch {
            // Still mark it ready: the toggle then reports a real failure
            // instead of staying disabled forever.
            setReady(true);
            sync();
          }
        });

        // Never leave the control disabled waiting on an SDK that may not load
        // (a reinstalled iOS app re-registers its worker and can miss the queue).
        sdkTimer = setTimeout(() => {
          if (cancelled) return;
          setReady(true);
          sync();
        }, SDK_WAIT_MS);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      if (sdkTimer) clearTimeout(sdkTimer);
    };
  }, [userId, sync]);

  // A permission changed in the browser settings while the app was in the
  // background must not leave the old state on screen.
  useEffect(() => {
    if (!ready || typeof window === 'undefined') return;
    const refresh = () => sync();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [ready, sync]);

  // Late SDK flags (the iOS push token) must reach the UI without a manual reload.
  const reconcile = useCallback(() => {
    RECONCILE_MS.forEach((ms) => {
      setTimeout(() => { if (mounted.current) sync(); }, ms);
    });
  }, [sync]);

  const subscribe = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return false;
    try {
      let granted = readPermission(OS) === 'granted';
      if (!granted) granted = await OS.Notifications.requestPermission();
      if (!granted) {
        sync();
        return false;
      }
      await OS.User.PushSubscription.optIn();
      // `optedIn` is the subscription intent and flips immediately; the Apple
      // token (`subscribed`) can take much longer, so it must not gate success.
      const optedIn = await waitFor(() => OS.User?.PushSubscription?.optedIn === true, 3000);
      sync();
      reconcile();
      return optedIn;
    } catch {
      sync();
      return false;
    }
  }, [sync, reconcile]);

  const unsubscribe = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return false;
    try {
      await OS.User.PushSubscription.optOut();
      await waitFor(() => OS.User?.PushSubscription?.optedIn === false);
      sync();
      reconcile();
      return true;
    } catch {
      sync();
      return false;
    }
  }, [sync, reconcile]);

  const device = deriveDeviceState({
    configured,
    supported: capability.supported,
    capabilityStatus: capability.status,
    ready,
    permission: sub.permission,
    optedIn: sub.optedIn,
    subscribed: sub.subscribed,
  });

  return {
    supported: capability.supported,
    configured,
    ready,
    permission: sub.permission,
    optedIn: sub.optedIn,
    subscribed: sub.subscribed,
    status: device.status,
    deviceOn: device.on,
    canToggle: device.canToggle,
    subscribe,
    unsubscribe,
    refresh: sync,
    // Backwards-compatible names used by the per-gathering notification sheet.
    requestPermission: subscribe,
    optOut: unsubscribe,
  };
}