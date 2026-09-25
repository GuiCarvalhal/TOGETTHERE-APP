import { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';

// Resolves a place name to { timeZoneId, countryCode } via the getTimezone
// backend function, with an in-memory + localStorage cache. Used by every
// date/time display so times render in the place's local timezone with the
// correct abbreviation and an ISO country code (e.g. "4:00 AM EDT - US").

const memCache = new Map();
const inflight = new Map();
function lsRead() { try { return JSON.parse(localStorage.getItem('tt-tz-cache') || '{}'); } catch { return {}; } }
function lsWrite(m) { try { localStorage.setItem('tt-tz-cache', JSON.stringify(m)); } catch { /* ignore */ } }
function normalize(v) {
  if (!v) return null;
  if (typeof v === 'string') return { timeZoneId: v, countryCode: '' }; // migrate old string cache
  return v;
}
function cached(place) {
  if (!place) return null;
  const k = place.toLowerCase();
  return normalize(memCache.get(k) || lsRead()[k]);
}
function remember(place, info) {
  if (!place || !info?.timeZoneId) return;
  const k = place.toLowerCase();
  memCache.set(k, info);
  const ls = lsRead(); ls[k] = info; lsWrite(ls);
}

async function fetchTz(place) {
  const k = place.toLowerCase();
  if (inflight.has(k)) return inflight.get(k);
  const p = (async () => {
    const res = await base44.functions.invoke('getTimezone', { place });
    const data = res.data || res;
    if (!data.timeZoneId) return null;
    return { timeZoneId: data.timeZoneId, countryCode: data.countryCode || '' };
  })();
  inflight.set(k, p);
  p.finally(() => inflight.delete(k));
  return p;
}

// Single place → IANA tz (null while loading / on failure).
export function usePlaceTimezone(place) {
  const [info, setInfo] = useState(() => cached(place));
  useEffect(() => {
    if (!place) { setInfo(null); return; }
    const existing = cached(place);
    if (existing) { setInfo(existing); return; }
    let active = true;
    fetchTz(place).then((r) => { if (r) { remember(place, r); if (active) setInfo(r); } }).catch(() => {});
    return () => { active = false; };
  }, [place]);
  return info?.timeZoneId || null;
}

// Single place → ISO country code (e.g. "US", "IT"). Reads the same cache as
// usePlaceTimezone, so it adds no extra backend call once the tz resolved.
export function usePlaceCountryCode(place) {
  const [cc, setCc] = useState(() => cached(place)?.countryCode || '');
  useEffect(() => {
    if (!place) { setCc(''); return; }
    const existing = cached(place);
    if (existing?.countryCode) { setCc(existing.countryCode); return; }
    let active = true;
    fetchTz(place).then((r) => { if (r) { remember(place, r); if (active) setCc(r.countryCode); } }).catch(() => {});
    return () => { active = false; };
  }, [place]);
  return cc;
}

// Many places → { [place]: tz } map. Resolves all unique places in parallel.
// `places` is an array; pass a stable list (it's keyed by the joined string).
export function useTimezonesForPlaces(places) {
  const key = (places || []).filter(Boolean).join('|');
  const initial = useMemo(() => {
    const m = {};
    (places || []).forEach((p) => { if (p) m[p] = cached(p)?.timeZoneId || null; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [map, setMap] = useState(initial);
  useEffect(() => {
    const unique = [...new Set((places || []).filter(Boolean).map((p) => p.toLowerCase()))];
    const toResolve = unique.filter((p) => !memCache.has(p) && !lsRead()[p]);
    if (!toResolve.length) {
      const m = {};
      (places || []).forEach((p) => { if (p) m[p] = cached(p)?.timeZoneId || null; });
      setMap(m);
      return;
    }
    let active = true;
    Promise.all(toResolve.map((p) => fetchTz(p).then((r) => { if (r) remember(p, r); return [p, r]; }).catch(() => [p, null]))).then(() => {
      if (!active) return;
      const m = {};
      (places || []).forEach((p) => { if (p) m[p] = cached(p)?.timeZoneId || null; });
      setMap(m);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}