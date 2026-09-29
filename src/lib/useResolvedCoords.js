import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Module-level dedupe so concurrent mounts / scope toggles never fire the same
// lookup twice in a session.
const resolving = new Set();

// Generic runtime coordinate resolver. Resolves a list of opaque "query items"
// to { lat, lng } via the EXISTING getPlaceInfo backend function — the same
// path the Agent place-detail page uses. No new backend, no second maps key.
//
// READ-ONLY by design: it never writes, updates, creates or deletes a record.
// Coordinates live only in component state + localStorage for the session.
//
//  - queries:        array of opaque items (only used to derive a key + query)
//  - keyFn(item):    stable string key (coords map identity + cache key)
//  - queryFn(item):  string sent to getPlaceInfo (empty string => skipped)
//  - storagePrefix:  localStorage key prefix for cross-session caching
//
// Returns { coords, pending }:
//  - coords:  { [key]: { lat, lng } } (only successfully resolved entries)
//  - pending: number of items still being resolved (0 when done)
//
// Pass an empty array when the consumer is collapsed to avoid all work.
// Callers batch results themselves (e.g. only swap in augmented data once
// pending hits 0) so the host map isn't re-created on every resolved pin.
export function useResolvedCoords(queries, { keyFn, queryFn, storagePrefix }) {
  const [coords, setCoords] = useState({});
  const [pending, setPending] = useState(0);
  const key = (queries || []).map(keyFn).join('||');

  useEffect(() => {
    const list = queries || [];
    if (!list.length) { setPending(0); return; }
    let active = true;

    // Seed from localStorage so cached places render instantly.
    const seed = {};
    list.forEach((q) => {
      const k = keyFn(q);
      try { const raw = localStorage.getItem(storagePrefix + k); if (raw) seed[k] = JSON.parse(raw); } catch { /* ignore */ }
    });
    if (active && Object.keys(seed).length) setCoords((c) => ({ ...c, ...seed }));

    const missing = list.filter((q) => {
      const k = keyFn(q);
      return !seed[k] && !resolving.has(storagePrefix + k) && queryFn(q);
    });
    if (!missing.length) { setPending(0); return; }

    setPending(missing.length);
    missing.forEach((q) => resolving.add(storagePrefix + keyFn(q)));
    let done = 0;

    (async () => {
      const CONC = 4;
      let idx = 0;
      const run = async (q) => {
        const k = keyFn(q);
        try {
          const res = await base44.functions.invoke('getPlaceInfo', { query: queryFn(q) });
          const d = res.data || res;
          if (d && d.lat != null && d.lng != null) {
            const v = { lat: d.lat, lng: d.lng };
            try { localStorage.setItem(storagePrefix + k, JSON.stringify(v)); } catch { /* ignore */ }
            if (active) setCoords((c) => ({ ...c, [k]: v }));
          }
        } catch { /* ignore — no coords for this query */ }
        finally {
          resolving.delete(storagePrefix + k);
          done += 1;
          if (active) setPending(missing.length - done);
        }
      };
      const workers = Array.from({ length: Math.min(CONC, missing.length) }, async () => {
        while (idx < missing.length) { const cur = missing[idx++]; await run(cur); }
      });
      await Promise.all(workers);
    })();

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { coords, pending };
}

export default useResolvedCoords;