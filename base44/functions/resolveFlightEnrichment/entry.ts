import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fetchAirportByIata, fetchFlightByNumber } from '../../shared/aeroDataBox.ts';
import { getPlaceDetails } from '../../shared/googlePlaces.ts';

// Read-only enrichment for legacy flight cards missing airline or city. Takes
// the flight's known fields (flight number, date, IATA codes if stored, and
// place_ids) and returns authoritative airline + from/to city:
//   - airline: from AeroDataBox flight-number lookup (the authoritative carrier;
//     never a code-prefix guess).
//   - from/to city: prefer AeroDataBox airport `municipality` by IATA (the
//     authoritative metro city, source-of-truth for actual flight airports);
//     fall back to Google Place Details by place_id (fixed cityFromComponents)
//     when no IATA is available. Never invents a city.
// All results are cached server-side (10 min) and never written to the DB.
//
// Body: { flight_number?, date?, from_iata?, to_iata?, from_place_id?, to_place_id? }
//  -> { airline, from_city, to_city }

const CACHE_TTL = 600_000; // 10 min
const cache = new Map<string, { t: number; val: any }>();
function get(key: string) {
  const e = cache.get(key);
  if (e && Date.now() - e.t < CACHE_TTL) return e.val;
  return undefined;
}
function set(key: string, val: any) {
  cache.set(key, { t: Date.now(), val });
  if (cache.size > 64) cache.clear();
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const rapidKey = secrets.get('RAPIDAPI_KEY');
    if (!rapidKey) return Response.json({ error: 'RapidAPI key not configured' }, { status: 500 });
    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');

    const flightNumber = String(body.flight_number || '').trim().toUpperCase().replace(/\s+/g, '');
    const date = String(body.date || '').trim();
    let fromIata = String(body.from_iata || '').trim().toUpperCase();
    let toIata = String(body.to_iata || '').trim().toUpperCase();
    const fromPlaceId = String(body.from_place_id || '').trim();
    const toPlaceId = String(body.to_place_id || '').trim();

    const ck = `enrich:${flightNumber}:${date}:${fromIata}:${toIata}:${fromPlaceId}:${toPlaceId}`;
    const cached = get(ck);
    if (cached) return Response.json(cached);

    let airline = '';
    // Flight-number lookup: authoritative airline, and IATA codes when not
    // already known from the stored place (e.g. a title "GRU → MIA" the frontend
    // parsed, or a stored from_place.iata).
    if (flightNumber && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const f = await fetchFlightByNumber(rapidKey, flightNumber, date);
      if (f) {
        airline = f.airline;
        if (!fromIata && f.dep_iata) fromIata = f.dep_iata;
        if (!toIata && f.arr_iata) toIata = f.arr_iata;
      }
    }

    // City resolution: prefer AeroDataBox airport municipality (authoritative
    // metro city) by IATA; fall back to Google Place Details by place_id when
    // no IATA is available. Never invents a city — missing stays empty.
    let fromCity = '';
    let toCity = '';
    const tasks: Promise<void>[] = [];
    if (fromIata && /^[A-Z]{3}$/.test(fromIata)) {
      tasks.push(fetchAirportByIata(rapidKey, fromIata).then((p) => { fromCity = p?.municipality || ''; }));
    } else if (fromPlaceId && mapsKey) {
      tasks.push(getPlaceDetails(mapsKey, fromPlaceId).then((p) => { fromCity = p?.city || ''; }).catch(() => {}));
    }
    if (toIata && /^[A-Z]{3}$/.test(toIata)) {
      tasks.push(fetchAirportByIata(rapidKey, toIata).then((p) => { toCity = p?.municipality || ''; }));
    } else if (toPlaceId && mapsKey) {
      tasks.push(getPlaceDetails(mapsKey, toPlaceId).then((p) => { toCity = p?.city || ''; }).catch(() => {}));
    }
    await Promise.all(tasks);

    const val = { airline, from_city: fromCity, to_city: toCity };
    set(ck, val);
    return Response.json(val);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}