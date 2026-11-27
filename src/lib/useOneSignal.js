import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { deriveDeviceState } from '@/lib/notificationDeviceState';

// Client-side OneSignal Web SDK hook. Initializes with the App ID (fetched
// server-side via getOneSignalConfig — the REST API key never reaches the
// client), associates the device with the Base44 user id, and exposes the REAL
// subscription state of this device.
//
// The device switch reads OneSignal's own push subscription (optedIn /
// subscribed) instead of the notification permission alone: a user who turned
// push off keeps a granted permission, so permission-only state reported the
// device as ON again after every refresh. No secrets are stored or exposed.

function readSubscription(OS) {
  const sub = OS?.User?.PushSubscription;
  return {
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
    optedIn: typeof sub?.optedIn === 'boolean' ? sub.optedIn : null,
    subscribed: typeof sub?.subscribed === 'boolean' ? sub.subscribed : null,
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
  const [supported, setSupported] = useState(false);
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

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke('getOneSignalConfig');
        const cfg = res.data || res;
        if (cancelled) return;
        setConfigured(Boolean(cfg.configured && cfg.appId));
        if (!cfg.configured || !cfg.appId) return;

        const natSupported = 'Notification' in window && 'serviceWorker' in navigator;
        setSupported(natSupported);
        if (!natSupported) return;

        if (typeof window.OneSignalDeferred === 'undefined') window.OneSignalDeferred = [];
        window.OneSignalDeferred.push(async (OneSignal) => {
          if (cancelled) return;
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
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
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

  const subscribe = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return false;
    try {
      let granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      if (!granted) granted = await OS.Notifications.requestPermission();
      if (!granted) {
        sync();
        return false;
      }
      await OS.User.PushSubscription.optIn();
      await waitFor(() => {
        const current = OS.User?.PushSubscription;
        return current?.optedIn === true && current?.subscribed === true;
      });
      sync();
      return true;
    } catch {
      sync();
      return false;
    }
  }, [sync]);

  const unsubscribe = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return false;
    try {
      await OS.User.PushSubscription.optOut();
      await waitFor(() => OS.User?.PushSubscription?.optedIn === false);
      sync();
      return true;
    } catch {
      sync();
      return false;
    }
  }, [sync]);

  const device = deriveDeviceState({
    configured,
    supported,
    ready,
    permission: sub.permission,
    optedIn: sub.optedIn,
    subscribed: sub.subscribed,
  });

  return {
    supported,
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