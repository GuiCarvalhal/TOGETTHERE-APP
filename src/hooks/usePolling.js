import { useEffect, useRef } from 'react';

/**
 * Lightweight polling refresh. Calls `callback` every `intervalMs`, but only
 * while the document is visible — pauses when the tab is hidden to save API
 * calls. Does not run on mount (the caller's initial load handles that).
 */
export default function usePolling(callback, intervalMs = 25000) {
  const saved = useRef(callback);
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') {
        try { saved.current(); } catch { /* silent poll */ }
      }
    };
    timer = setInterval(tick, intervalMs);
    const onResume = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onResume);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onResume); };
  }, [intervalMs]);
}