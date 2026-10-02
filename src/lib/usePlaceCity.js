import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Read-only resolution of a place's city/locality from its stored Google
// place_id, for legacy journey items whose from_place/to_place were saved
// before the `city` field existed. Resolves once per place_id (module-level
// cache + in-flight dedupe), never writes to the DB, never invents a city,
// and never re-geocodes free text on every render. Returns { city, loading }.
//
//  - If the place already carries a stored `city`, it is returned instantly.
//  - If the place has a place_id but no city (legacy), resolves once from the
//    place_id via the existing resolvePlace backend (same path the journey
//    form uses at entry time), cached for the session.
//  - If there is no place_id, returns '' immediately (nothing to resolve).
const cityCache = new Map(); // place_id -> city ('' when resolved-but-absent)
const failed = new Set(); // place_id -> resolved no city (don't retry)
const inflight = new Map(); // place_id -> Promise<city>

function fetchCity(placeId) {
  if (inflight.has(placeId)) return inflight.get(placeId);
  const p = (async () => {
    try {
      const res = await base44.functions.invoke('resolvePlace', { place_id: placeId });
      const c = (res.data || res)?.place?.city || '';
      cityCache.set(placeId, c);
      if (!c) failed.add(placeId);
      return c;
    } catch {
      failed.add(placeId);
      return '';
    } finally {
      inflight.delete(placeId);
    }
  })();
  inflight.set(placeId, p);
  return p;
}

export function usePlaceCity(place) {
  const placeId = place?.place_id || '';
  const stored = place?.city || '';
  const [city, setCity] = useState(stored || (placeId ? (cityCache.get(placeId) || '') : ''));
  const [loading, setLoading] = useState(!stored && !!placeId && !cityCache.has(placeId) && !failed.has(placeId));

  useEffect(() => {
    if (stored) { setCity(stored); setLoading(false); return; }
    if (!placeId) { setCity(''); setLoading(false); return; }
    if (cityCache.has(placeId)) { setCity(cityCache.get(placeId)); setLoading(false); return; }
    if (failed.has(placeId)) { setCity(''); setLoading(false); return; }
    let active = true;
    setLoading(true);
    fetchCity(placeId).then((c) => { if (active) { setCity(c); setLoading(false); } });
    return () => { active = false; };
  }, [placeId, stored]);

  return { city, loading };
}

export default usePlaceCity;