import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Stable cache key for a suggestion place (name + address). Exported so the
// Agent page can look up resolved coords in the map returned by the hook.
export const agentPlaceKey = (place) => `${place?.name || ''}::${place?.address || ''}`;

const STORAGE_PREFIX = 'tt-agent-coords::';
const resolving = new Set();

// Resolves { lat, lng } for a list of AI-suggested places via the EXISTING
// getPlaceInfo backend function — the same path the Agent place-detail page
// uses. No new backend, no second maps key. Results are localStorage-cached
// (keyed by name+address) and module-deduped so concurrent mounts and reloads
// don't re-fetch. Returns { coords, pending }:
//  - coords: { [agentPlaceKey(place)]: { lat, lng } } (only successful ones)
//  - pending: number of places still being resolved (0 when done)
// Pass an empty array when the consumer is collapsed to avoid any work.
export function useAgentPlaceCoords(places) {
  const [coords, setCoords] = useState({});
  const [pending, setPending] = useState(0);
  const key = (places || []).map(agentPlaceKey).join('||');

  useEffect(() => {
    const list = places || [];
    if (!list.length) { setPending(0); return; }
    let active = true;

    // Seed from localStorage cache so cached places render instantly.
    const seed = {};
    list.forEach((p) => {
      const k = STORAGE_PREFIX + agentPlaceKey(p);
      try { const raw = localStorage.getItem(k); if (raw) seed[agentPlaceKey(p)] = JSON.parse(raw); } catch { /* ignore */ }
    });
    if (active && Object.keys(seed).length) setCoords((c) => ({ ...c, ...seed }));

    const missing = list.filter((p) => {
      const pk = agentPlaceKey(p);
      return !seed[pk] && !resolving.has(STORAGE_PREFIX + pk);
    });
    if (!missing.length) { setPending(0); return; }

    setPending(missing.length);
    missing.forEach((p) => resolving.add(STORAGE_PREFIX + agentPlaceKey(p)));
    let done = 0;

    (async () => {
      const CONC = 4;
      let idx = 0;
      const run = async (p) => {
        const pk = agentPlaceKey(p);
        try {
          const query = p.address ? `${p.name}, ${p.address}` : p.name;
          const res = await base44.functions.invoke('getPlaceInfo', { query });
          const d = res.data || res;
          if (d && d.lat != null && d.lng != null) {
            const v = { lat: d.lat, lng: d.lng };
            try { localStorage.setItem(STORAGE_PREFIX + pk, JSON.stringify(v)); } catch { /* ignore */ }
            if (active) setCoords((c) => ({ ...c, [pk]: v }));
          }
        } catch { /* ignore — no coords for this place */ }
        finally {
          resolving.delete(STORAGE_PREFIX + pk);
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

export default useAgentPlaceCoords;