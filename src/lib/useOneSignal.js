import { useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// Client-side OneSignal Web SDK hook. Initializes with the App ID (fetched
// server-side via getOneSignalConfig — the REST API key never reaches the
// client), associates the device with the Base44 user id, and exposes a safe
// opt-in. No secrets are stored or exposed.
export function useOneSignal(userId) {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [permission, setPermission] = useState('default');
  const [ready, setReady] = useState(false);

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
            setPermission(Notification.permission);
            OneSignal.Notifications.addEventListener('click', (event) => {
              try {
                const data = event?.notification?.data || event?.data || {};
                if (data.route) window.location.href = data.route;
              } catch { /* ignore */ }
            });
            setReady(true);
          } catch { /* ignore init errors */ }
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const requestPermission = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return false;
    try {
      const granted = await OS.Notifications.requestPermission();
      setPermission(granted ? 'granted' : 'denied');
      if (granted) {
        try { await OS.User.PushSubscription.optIn(); } catch { /* ignore */ }
      }
      return !!granted;
    } catch { return false; }
  }, []);

  const optOut = useCallback(async () => {
    const OS = window._ttOneSignal;
    if (!OS) return;
    try { await OS.User.PushSubscription.optOut(); } catch { /* ignore */ }
  }, []);

  return { supported, configured, permission, ready, requestPermission, optOut };
}