import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

// Resolves a place name (or list of place names) to an IANA timezone string
// ("Europe/Rome") via the getTimezone backend function, with an in-memory +
// localStorage cache so repeated renders never re-fetch. Used by every
// date/time display so times render in the place's local timezone.

const memCache = new Map();
function lsRead() { try { return JSON.parse(localStorage.getItem('tt-tz-cache') || '{}'); } catch { return {}; } }
function lsWrite(m) { try { localStorage.setItem('tt-tz-cache', JSON.stringify(m)); } catch { /* ignore */ } }
function cached(place) {
  if (!place) return null;
  const k = place.toLowerCase();
  return memCache.get(k) || lsRead()[k] || null;
}
function remember(place, tz) {
  if (!place || !tz) return;
  const k = place.toLowerCase();
  memCache.set(k, tz);
  const ls = lsRead(); ls[k] = tz; lsWrite(ls);
}

async function fetchTz(place) {
  const res = await base44.functions.invoke('getTimezone', { place });
  const data = res.data || res;
  return data.timeZoneId || null;
}

// Single place → IANA tz (null while loading / on failure).
export function usePlaceTimezone(place) {
  const [tz, setTz] = useState(() => cached(place));
  useEffect(() => {
    if (!place) { setTz(null); return; }
    const existing = cached(place);
    if (existing) { setTz(existing); return; }
    let active = true;
    fetchTz(place).then((id) => { if (id) { remember(place, id); if (active) setTz(id); } }).catch(() => {});
    return () => { active = false; };
  }, [place]);
  return tz;
}

// Many places → { [place]: tz } map. Resolves all unique places in parallel.
// `places` is an array; pass a stable list (it's keyed by the joined string).
export function useTimezonesForPlaces(places) {
  const key = (places || []).filter(Boolean).join('|');
  const initial = useMemo(() => {
    const m = {};
    (places || []).forEach((p) => { if (p) m[p] = cached(p); });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [map, setMap] = useState(initial);
  useEffect(() => {
    const unique = [...new Set((places || []).filter(Boolean).map((p) => p.toLowerCase()))];
    const toResolve = unique.filter((p) => !memCache.has(p) && !lsRead()[p]);
    if (!toResolve.length) {
      const m = {};
      (places || []).forEach((p) => { if (p) m[p] = cached(p); });
      setMap(m);
      return;
    }
    let active = true;
    Promise.all(toResolve.map((p) => fetchTz(p).then((id) => { if (id) remember(p, id); return [p, id]; }).catch(() => [p, null]))).then(() => {
      if (!active) return;
      const m = {};
      (places || []).forEach((p) => { if (p) m[p] = cached(p); });
      setMap(m);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}