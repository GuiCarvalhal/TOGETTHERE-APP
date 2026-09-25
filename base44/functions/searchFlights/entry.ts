import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Flight search via AeroDataBox on RapidAPI (RAPIDAPI_KEY). Two lookup modes,
// both requiring a departure date:
//   A. by flight number  -> { flight_number, date }
//   B. by route          -> { origin_lat, origin_lng, dest_lat, dest_lng, date }
//      (origin/destination come from Google Places autocomplete; the backend
//       resolves each to an IATA via the nearest-airport endpoint, then queries
//       origin departures for the origin-local day in two 12h windows and
//       filters by destination IATA — there is no direct route endpoint.)
//
// Returns a single stable contract: { results: FlightSearchResult[] } where
// each result carries airline, flight number, origin/destination IATA + name +
// country + IANA tz, scheduled LOCAL and UTC times, duration, an overnight
// flag, and any codeshares. The frontend resolves full Google Places for the
// chosen result separately (resolveFlightAirports) so we never resolve N
// airports for N results.
//
// Provider key stays server-side. Input is validated and URL-encoded. 400/404
// → friendly 404, 429 → retried once after a brief delay, 5xx → 502. Identical
// queries are cached briefly (especially route searches, which cost 2 calls)
// to protect quota.

const RAPID_HOST = 'aerodatabox.p.rapidapi.com';
const CACHE_TTL_MS = 60_000; // 1 minute — protects against double-clicks / re-edits
const cache = new Map<string, { t: number; val: any }>();

function cached(key: string) {
  const e = cache.get(key);
  if (e && Date.now() - e.t < CACHE_TTL_MS) return e.val;
  return undefined;
}
function setCache(key: string, val: any) {
  cache.set(key, { t: Date.now(), val });
  if (cache.size > 64) cache.clear(); // bound growth
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function headers(key: string) {
  return { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPID_HOST };
}

// Parse an AeroDataBox UTC string ("2026-09-25 02:40Z" or ISO) into a JS Date.
function parseUtc(raw: string): Date | null {
  if (!raw) return null;
  const s = String(raw).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// "YYYY-MM-DD" date part of an AeroDataBox local string ("2026-09-24 22:40-04:00").
function localDate(raw: string): string {
  return String(raw || '').slice(0, 10);
}

// Map a raw AeroDataBox flight entry (from either endpoint) into the stable
// FlightSearchResult contract. `src` labels the airport objects ("departure"/
// "arrival" for the departures endpoint with withLeg, or the same for the
// flight-number endpoint which already uses departure/arrival).
function mapFlight(f: any): any {
  const dep = f.departure || {};
  const arr = f.arrival || {};
  const depUtc = dep.scheduledTime?.utc || '';
  const arrUtc = arr.scheduledTime?.utc || '';
  const depLocal = dep.scheduledTime?.local || '';
  const arrLocal = arr.scheduledTime?.local || '';
  const depD = parseUtc(depUtc);
  const arrD = parseUtc(arrUtc);
  let durationMin: number | null = null;
  if (depD && arrD) durationMin = Math.round((arrD.getTime() - depD.getTime()) / 60000);
  // Overnight: arrival local calendar date is after departure local calendar date.
  let overnight = false;
  let dayShift = 0;
  if (depLocal && arrLocal) {
    const a = localDate(depLocal);
    const b = localDate(arrLocal);
    if (a && b && b > a) {
      overnight = true;
      const da = new Date(a + 'T00:00:00Z').getTime();
      const db = new Date(b + 'T00:00:00Z').getTime();
      dayShift = Math.round((db - da) / 86400000);
    }
  }
  const number = f.number || '';
  const codeshares = (f.codeshares || []).map((c: any) => ({
    number: c.number || '',
    airline_name: c.airline?.name || '',
  }));
  return {
    id: `${number}|${depUtc}`,
    number,
    airline_name: f.airline?.name || '',
    airline_iata: f.airline?.iata || '',
    is_codeshare: !!f.isCodeshare,
    status: f.status || '',
    dep_iata: dep.airport?.iata || '',
    dep_name: dep.airport?.name || '',
    dep_country: (dep.airport?.countryCode || '').toUpperCase(),
    dep_tz: dep.airport?.timeZone || '',
    dep_local: depLocal,
    dep_utc: depUtc,
    arr_iata: arr.airport?.iata || '',
    arr_name: arr.airport?.name || '',
    arr_country: (arr.airport?.countryCode || '').toUpperCase(),
    arr_tz: arr.airport?.timeZone || '',
    arr_local: arrLocal,
    arr_utc: arrUtc,
    duration_min: durationMin,
    overnight,
    day_shift: dayShift,
    codeshares,
  };
}

// Deduplicate by id (number + departure UTC) preserving order.
function dedupe(results: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const r of results) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

// Fetch with a single 429 retry (the PRO plan enforces a per-second limit).
async function fetchJson(key: string, url: string, label: string): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: headers(key) });
    if (res.status === 429 && attempt === 0) {
      await sleep(1200);
      continue;
    }
    if (res.status === 429) return { __rate: true };
    if (res.status === 400 || res.status === 404) return { __notfound: true };
    if (!res.ok) return { __error: res.status };
    const text = await res.text();
    if (!text) return { __empty: true };
    try {
      return { __ok: true, data: JSON.parse(text) };
    } catch {
      return { __empty: true };
    }
  }
  return { __error: 500 };
}

// Resolve a Google Place lat/lng to the nearest airport's IATA + AeroDataBox
// metadata (name, country, Olson tz, coordinates). Returns null on any failure
// so the caller can surface a friendly error.
async function nearestAirport(key: string, lat: number, lng: number): Promise<any | null> {
  const url = `https://${RAPID_HOST}/airports/search/location?lat=${lat}&lon=${lng}&radiusKm=100&limit=5`;
  const r = await fetchJson(key, url, 'nearest');
  if (!r.__ok) return null;
  const items = r.data?.items || [];
  if (!items.length) return null;
  const a = items[0];
  return {
    iata: a.iata || '',
    name: a.shortName || a.name || '',
    country: (a.countryCode || '').toUpperCase(),
    tz: a.timeZone || '',
    lat: a.location?.lat ?? null,
    lon: a.location?.lon ?? null,
  };
}

// Query one 12h window of departures from an origin IATA, return mapped results.
async function departuresWindow(key: string, iata: string, fromLocal: string, toLocal: string): Promise<any[]> {
  const url = `https://${RAPID_HOST}/flights/airports/iata/${encodeURIComponent(iata)}/${encodeURIComponent(fromLocal)}/${encodeURIComponent(toLocal)}?direction=Departure&withLeg=true&withCodeshared=true`;
  const r = await fetchJson(key, url, 'departures');
  if (!r.__ok) return [];
  const deps = r.data?.departures || [];
  return deps.map(mapFlight);
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const date = (body.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ error: 'A departure date is required (YYYY-MM-DD).' }, { status: 400 });
    }

    const key = secrets.get('RAPIDAPI_KEY');
    if (!key) return Response.json({ error: 'RapidAPI key (RAPIDAPI_KEY) not configured' }, { status: 500 });

    // ---- Mode A: flight number ----
    if (body.flight_number !== undefined) {
      const flightNumber = String(body.flight_number).trim().toUpperCase().replace(/\s+/g, '');
      if (!flightNumber) {
        return Response.json({ error: 'Enter a flight number (e.g. AA123).' }, { status: 400 });
      }
      if (!/^[A-Z0-9]{2,5}$/.test(flightNumber) || !/\d/.test(flightNumber)) {
        return Response.json({ error: "That doesn't look like a flight number. Use the airline code plus number, e.g. AA123." }, { status: 400 });
      }
      const cacheKey = `fn:${flightNumber}:${date}`;
      const cachedVal = cached(cacheKey);
      if (cachedVal) return Response.json(cachedVal);

      const url = `https://${RAPID_HOST}/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
      const r = await fetchJson(key, url, 'number');
      if (r.__rate) return Response.json({ error: 'The flight provider is busy. Try again in a moment.' }, { status: 429 });
      if (r.__notfound || r.__empty) {
        const val = { results: [] };
        setCache(cacheKey, val);
        return Response.json(val);
      }
      if (r.__error) return Response.json({ error: 'Flight lookup is unavailable right now. Try again in a moment.' }, { status: 502 });
      const list = Array.isArray(r.data) ? r.data : [];
      const results = dedupe(list.map(mapFlight));
      const val = { results };
      setCache(cacheKey, val);
      return Response.json(val);
    }

    // ---- Mode B: route (origin + destination) ----
    const ol = Number(body.origin_lat);
    const og = Number(body.origin_lng);
    const dl = Number(body.dest_lat);
    const dg = Number(body.dest_lng);
    if (!isFinite(ol) || !isFinite(og) || !isFinite(dl) || !isFinite(dg)) {
      return Response.json({ error: 'Choose both an origin and a destination airport.' }, { status: 400 });
    }
    const cacheKey = `rt:${ol},${og}->${dl},${dg}:${date}`;
    const cachedVal = cached(cacheKey);
    if (cachedVal) return Response.json(cachedVal);

    // All provider calls are sequential with ~1.3s spacing — the PRO plan
    // enforces a per-second rate limit, so parallel calls 429.
    const origin = await nearestAirport(key, ol, og);
    if (!origin?.iata) {
      return Response.json({ error: "Couldn't find a nearby airport for the origin. Pick a recognized airport." }, { status: 404 });
    }
    await sleep(1300);
    const dest = await nearestAirport(key, dl, dg);
    if (!dest?.iata) {
      return Response.json({ error: "Couldn't find a nearby airport for the destination. Pick a recognized airport." }, { status: 404 });
    }

    // Two 12h windows covering the origin-local calendar day (the API interprets
    // fromLocal/toLocal as origin-local time).
    await sleep(1300);
    const w1 = await departuresWindow(key, origin.iata, `${date}T00:00`, `${date}T12:00`);
    await sleep(1300);
    const w2 = await departuresWindow(key, origin.iata, `${date}T12:00`, `${date}T23:59`);
    const all = dedupe([...w1, ...w2]);
    // Filter by destination IATA; sort by scheduled departure UTC.
    const results = all
      .filter((r) => r.arr_iata === dest.iata)
      .sort((a, b) => {
        const ta = parseUtc(a.dep_utc)?.getTime() || 0;
        const tb = parseUtc(b.dep_utc)?.getTime() || 0;
        return ta - tb;
      });

    const val = { results, origin_iata: origin.iata, dest_iata: dest.iata };
    setCache(cacheKey, val);
    return Response.json(val);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}