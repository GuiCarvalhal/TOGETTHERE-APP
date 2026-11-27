import { providerJson, ProviderFailure, invalidProviderShape } from './providerJson.ts';

export const AERO_DATA_VERSION = 'aerodatabox-v2-strict-municipalityName';
const RAPID_HOST = 'aerodatabox.p.rapidapi.com';
let queue = Promise.resolve();
let nextRequestAt = 0;

// The provider's per-second limit applies to both endpoints. Serialize starts,
// including retries; each lookup still has at most two HTTP attempts.
function pacedFetch(url, options) {
  const request = queue.then(async () => {
    const wait = nextRequestAt - Date.now();
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait));
    nextRequestAt = Date.now() + 1300;
    return fetch(url, options);
  });
  queue = request.then(() => undefined, () => undefined);
  return request;
}

async function request(key, path, source) {
  if (!key) throw new ProviderFailure(source, 'NOT_CONFIGURED', 'Flight provider is not configured.', false);
  return providerJson(`https://${RAPID_HOST}${path}`, {
    headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPID_HOST },
  }, source, pacedFetch);
}
const text = value => typeof value === 'string' ? value.trim() : '';

// Only an explicit 404/204 means NOT_FOUND. Transport/parse/shape failures throw.
export async function fetchAirportByIata(key, iata) {
  const source = 'aerodatabox.airport';
  const data = await request(key, `/airports/iata/${encodeURIComponent(iata)}`, source);
  if (data === null) return null;
  if (!data || Array.isArray(data) || text(data.iata).toUpperCase() !== iata.toUpperCase() ||
      (data.municipalityName != null && typeof data.municipalityName !== 'string')) throw invalidProviderShape(source);
  return {
    iata: text(data.iata), municipality: text(data.municipalityName),
    country: text(data.country?.code).toUpperCase(), tz: text(data.timeZone),
    name: text(data.shortName || data.fullName || data.name),
    lat: data.location?.lat ?? null, lon: data.location?.lon ?? null,
  };
}

// Resolve the nearest airport to a lat/lng via the AeroDataBox location
// search endpoint. Used by the flight-metadata backfill to recover an IATA
// code for legacy records that have a resolved Google Place (lat/lng) but no
// stored IATA. Returns null when no airport is found within the radius.
export async function fetchNearestAirport(key, lat, lng) {
  const source = 'aerodatabox.airport';
  const data = await request(key, `/airports/search/location?lat=${lat}&lon=${lng}&radiusKm=100&limit=5`, source);
  if (data === null) return null;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;
  const a = items[0];
  if (!a || typeof a !== 'object') throw invalidProviderShape(source);
  return {
    iata: text(a.iata), municipality: text(a.municipalityName),
    country: text(a.countryCode).toUpperCase(), tz: text(a.timeZone),
    name: text(a.shortName || a.name),
  };
}

export async function fetchFlightByNumber(key, flightNumber, date) {
  const source = 'aerodatabox.flight';
  const data = await request(key, `/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(date)}`, source);
  if (data === null) return null;
  if (!Array.isArray(data) || data.some(flight => !flight || typeof flight.number !== 'string' ||
      !flight.departure || !flight.arrival || (flight.airline?.name != null && typeof flight.airline.name !== 'string'))) throw invalidProviderShape(source);
  if (!data.length) return null;
  const flight = data.find(value => !value.isCodeshare) || data[0];
  return {
    airline: text(flight.airline?.name), dep_iata: text(flight.departure.airport?.iata),
    arr_iata: text(flight.arrival.airport?.iata), dep_name: text(flight.departure.airport?.name),
    arr_name: text(flight.arrival.airport?.name),
  };
}

// Rich LIVE status for one flight number on one calendar date: on-time/delayed/
// cancelled, gates, terminals, scheduled vs revised local times and the
// provider's own last-updated stamp. Goes through the same paced `request` as
// the metadata resolver, so both share the provider's per-second limit instead
// of doubling the call rate.
//
// Returns EVERY rotation the provider files under that date, in provider order:
// one number can come back twice (asking for 26 Nov for a nightly flight also
// returns the 25 Nov one), so the caller picks the rotation that matches its own
// segment instead of trusting the first entry.
export async function fetchFlightsLiveByNumber(key, flightNumber, date) {
  const source = 'aerodatabox.flight';
  const data = await request(key, `/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(date)}`, source);
  if (data === null) return [];
  if (!Array.isArray(data) || data.some(f => !f || typeof f.number !== 'string' || !f.departure || !f.arrival)) throw invalidProviderShape(source);
  const side = (s) => ({
    iata: text(s?.airport?.iata), name: text(s?.airport?.name),
    scheduled: text(s?.scheduledTime?.local), revised: text(s?.revisedTime?.local),
    actual: text(s?.actualTime?.local), terminal: text(s?.terminal), gate: text(s?.gate),
  });
  // "Basic" means the provider only holds the schedule for that airport: the
  // status word never moves and no gate is ever filled in (GRU answers this way
  // even for a flight that already left). "Live" means the record is fed by
  // real movement data. Callers must not present a Basic record as a live status.
  const liveQuality = (s) => Array.isArray(s?.quality) && s.quality.includes('Live');
  return data.map(f => ({
    number: text(f.number), codeshare: f.isCodeshare === true,
    status: text(f.status), airline: text(f.airline?.name),
    lastUpdatedUtc: text(f.lastUpdatedUtc), live: liveQuality(f.departure) || liveQuality(f.arrival),
    departure: side(f.departure), arrival: side(f.arrival),
    aircraft: { model: text(f.aircraft?.model), reg: text(f.aircraft?.reg) },
  }));
}

// Single-flight convenience: the first scheduled rotation the provider returns.
export async function fetchFlightLiveByNumber(key, flightNumber, date) {
  const list = await fetchFlightsLiveByNumber(key, flightNumber, date);
  return list.find(f => !f.codeshare) || list[0] || null;
}