import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Read-only enrichment for legacy flight cards missing airline or city.
// Resolves once per flight (module-level cache + in-flight dedupe), never
// writes to the DB, never invents values, and never re-resolves on every
// render. Prefers stored fields; fills gaps from the authoritative provider
// (AeroDataBox airport municipality + flight-number airline) via the
// resolveFlightEnrichment backend, with a title-parsed airline as a free
// fallback. Returns { airline, fromCity, toCity, loading }.
//
// Only flights trigger resolution; non-flights return '' instantly (no call).
// A stored city that looks like a 2-3 letter code (e.g. a stale state code
// "SP") is treated as missing so the authoritative IATA municipality can
// override it for city-only display.

const cache = new Map(); // key -> { airline, fromCity, toCity }
const failed = new Set(); // key -> errored, don't retry
const inflight = new Map(); // key -> Promise

function isCodeLike(s) {
  return /^[A-Z]{2,3}$/.test((s || '').trim());
}

// Extract IATA codes from a title like "GRU → MIA" / "GRU -> MIA" / "GRU-MIA".
function iataFromTitle(title) {
  const m = String(title || '').match(/\b([A-Z]{3})\b\s*(?:\u2192|->|-)\s*\b([A-Z]{3})\b/);
  return m ? { from: m[1], to: m[2] } : null;
}

// Parse an airline from a title like "Air Canada AC095" (airline name then
// flight number) or "Flight AA123 — American Airlines". Uses the stored title
// only — never a code-prefix guess.
function airlineFromTitle(title) {
  const t = String(title || '');
  let m = t.match(/^[Ff]light\s+\S+\s+[—–-]\s+(.+)$/);
  if (m) return m[1].trim();
  m = t.match(/^(.+?)\s+[A-Z]{2}\d{1,4}$/);
  if (m) return m[1].trim();
  return '';
}

export function useFlightEnrichment(item) {
  const isFlight = item?.type === 'flight';
  const fn = (item?.confirmation_number || '').trim().toUpperCase().replace(/\s+/g, '');
  const date = item?.start_datetime ? item.start_datetime.slice(0, 10) : '';
  const storedAirline = item?.airline || '';
  const storedFromCity = item?.from_place?.city || '';
  const storedToCity = item?.to_place?.city || '';

  const titleIata = isFlight ? iataFromTitle(item?.title) : null;
  const fromIata = item?.from_place?.iata || titleIata?.from || '';
  const toIata = item?.to_place?.iata || titleIata?.to || '';
  const fromPlaceId = item?.from_place?.place_id || '';
  const toPlaceId = item?.to_place?.place_id || '';

  const titleAirline = isFlight ? airlineFromTitle(item?.title) : '';
  const needAirline = isFlight && !storedAirline && !titleAirline && !!fn && !!date;
  const needFromCity = isFlight && (!storedFromCity || isCodeLike(storedFromCity)) && (!!fromIata || !!fromPlaceId);
  const needToCity = isFlight && (!storedToCity || isCodeLike(storedToCity)) && (!!toIata || !!toPlaceId);
  const needsFetch = needAirline || needFromCity || needToCity;

  const key = needsFetch ? `enrich:${fn}:${date}:${fromIata}:${toIata}:${fromPlaceId}:${toPlaceId}` : '';

  const [resolved, setResolved] = useState(null);
  const [loading, setLoading] = useState(needsFetch);

  useEffect(() => {
    if (!needsFetch) { setResolved(null); setLoading(false); return; }
    const c = cache.get(key);
    if (c) { setResolved(c); setLoading(false); return; }
    if (failed.has(key)) { setResolved(null); setLoading(false); return; }
    let active = true;
    setLoading(true);
    const p = inflight.get(key) || (async () => {
      try {
        const res = await base44.functions.invoke('resolveFlightEnrichment', {
          flight_number: fn, date, from_iata: fromIata, to_iata: toIata,
          from_place_id: fromPlaceId, to_place_id: toPlaceId,
        });
        const data = res.data || res;
        const val = { airline: data.airline || '', fromCity: data.from_city || '', toCity: data.to_city || '' };
        cache.set(key, val);
        return val;
      } catch {
        failed.add(key);
        return null;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    p.then((v) => { if (active) { setResolved(v); setLoading(false); } });
    return () => { active = false; };
  }, [key, needsFetch]);

  const airline = storedAirline || titleAirline || resolved?.airline || '';
  const fromCity = (storedFromCity && !isCodeLike(storedFromCity)) ? storedFromCity : (resolved?.fromCity || '');
  const toCity = (storedToCity && !isCodeLike(storedToCity)) ? storedToCity : (resolved?.toCity || '');

  return { airline, fromCity, toCity, loading: isFlight ? loading : false };
}

export default useFlightEnrichment;