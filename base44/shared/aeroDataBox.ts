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