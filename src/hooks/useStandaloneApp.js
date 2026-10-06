import { useEffect, useState } from 'react';
import { isStandaloneApp } from '@/lib/isStandaloneApp';

// Reactive standalone-mode flag. Initializes synchronously from
// isStandaloneApp() so the first paint is correct (no flash), then stays in
// sync if the display mode changes at runtime — e.g. the user installs the
// app (the 'appinstalled' event fires, and the standalone media query flips)
// or the browser switches between display modes.
//
// Returns a boolean: true when running as an installed app.
export function useStandaloneApp() {
  const [standalone, setStandalone] = useState(() => isStandaloneApp());

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mq = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setStandalone(isStandaloneApp());

    // Standard + Safari vendor listeners.
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
    } else if (mq && typeof mq.addListener === 'function') {
      mq.addListener(onChange);
    }

    const onInstalled = () => setStandalone(true);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      if (mq && typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', onChange);
      } else if (mq && typeof mq.removeListener === 'function') {
        mq.removeListener(onChange);
      }
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return standalone;
}

export default useStandaloneApp;