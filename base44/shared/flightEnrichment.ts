// Positive-only, versioned caches. No DB access; errors and missing fields are never cached.
export const ENRICHMENT_VERSION = 'flight-enrichment-v2';
const TTL = 600000;
const fields = ['airline', 'from_city', 'to_city'];

export function createFlightEnrichmentResolver({ lookupFlight, lookupAirport, lookupPlace, helperVersion, now = Date.now }) {
  const positive = new Map();
  const complete = new Map();
  const inflight = new Map();
  const sourceInflight = new Map();
  function read(map, key) {
    const entry = map.get(key);
    if (entry && now() - entry.time < TTL) return entry.value;
    map.delete(key);
  }
  function save(map, key, value) {
    map.set(key, { time: now(), value });
    if (map.size > 128) map.delete(map.keys().next().value);
  }
  async function memo(key, load, useful) {
    const cached = read(positive, key);
    if (cached) return { value: cached, cached: true };
    if (!sourceInflight.has(key)) {
      const request = Promise.resolve().then(load).then(value => {
        if (value && useful(value)) save(positive, key, value);
        return { value, cached: false };
      }).finally(() => sourceInflight.delete(key));
      sourceInflight.set(key, request);
    }
    return sourceInflight.get(key);
  }
  async function resolve(input) {
    const result = { airline: '', from_city: '', to_city: '', warnings: [], errors: [], sources: {}, version: ENRICHMENT_VERSION, helper_version: helperVersion, cache: { hit: false, version: ENRICHMENT_VERSION } };
    function warning(field, source, code, message) {
      const issue = { field, source, code, message, retryable: false };
      result.warnings.push(issue);
      result.sources[field].push({ ...issue, status: 'missing' });
    }
    async function attempt(field, source, key, load, useful) {
      result.sources[field] ||= [];
      try {
        const { value, cached } = await memo(`${ENRICHMENT_VERSION}:${key}`, load, useful);
        if (!value) warning(field, source, 'NOT_FOUND', 'Provider returned no matching record.');
        else result.sources[field].push({ source, status: 'ok', cached });
        return value;
      } catch (error) {
        const issue = { field, source, code: error.code || 'SOURCE_FAILURE', message: error.code ? error.message : 'Provider lookup failed.', retryable: error.retryable !== false, http_status: error.http_status ?? null };
        result.errors.push(issue);
        result.sources[field].push({ ...issue, status: 'error' });
        return null;
      }
    }
    let fromIata = input.from_iata;
    let toIata = input.to_iata;
    result.sources.airline = [];
    if (input.flight_number && input.date) {
      const flight = await attempt('airline', 'aerodatabox.flight', `flight:${input.flight_number}:${input.date}`,
        () => lookupFlight(input.flight_number, input.date), value => !!value.airline);
      if (flight) {
        result.airline = flight.airline || '';
        fromIata ||= flight.dep_iata;
        toIata ||= flight.arr_iata;
        if (!result.airline) warning('airline', 'aerodatabox.flight', 'MISSING_FIELD', 'Flight record has no airline name.');
      }
    } else warning('airline', 'input', 'MISSING_INPUT', 'No flight number and date available for airline lookup.');
    async function city(field, iata, placeId) {
      result.sources[field] = [];
      if (iata) {
        const airport = await attempt(field, 'aerodatabox.airport', `airport:${iata}`, () => lookupAirport(iata), value => !!value.municipality);
        if (airport?.municipality) return airport.municipality;
        if (airport) warning(field, 'aerodatabox.airport', 'MISSING_FIELD', 'Airport record has no municipality.');
      }
      // Also runs when IATA exists but is missing, incomplete, or failed.
      if (placeId) {
        const place = await attempt(field, 'google.places', `place:${placeId}`, () => lookupPlace(placeId), value => !!value.city);
        if (place?.city) return place.city;
        if (place) warning(field, 'google.places', 'MISSING_FIELD', 'Place record has no city/locality.');
      }
      if (!iata && !placeId) warning(field, 'input', 'MISSING_INPUT', 'No airport code or Place ID available for city lookup.');
      return '';
    }
    [result.from_city, result.to_city] = await Promise.all([
      city('from_city', fromIata, input.from_place_id), city('to_city', toIata, input.to_place_id),
    ]);
    return result;
  }
  return async function enrich(input) {
    const key = `${ENRICHMENT_VERSION}:${JSON.stringify(input)}`;
    const cached = read(complete, key);
    if (cached) return { ...cached, cache: { hit: true, version: ENRICHMENT_VERSION } };
    if (!inflight.has(key)) {
      const request = resolve(input).then(result => {
        if (fields.every(field => !!result[field]) && !result.errors.length && !result.warnings.length) save(complete, key, result);
        return result;
      }).finally(() => inflight.delete(key));
      inflight.set(key, request);
    }
    return inflight.get(key);
  };
}