// Test runner globals keep test-only dependencies out of backend deployment.
const { test } = globalThis;
import assert from 'node:assert/strict';
import { ProviderFailure, providerJson } from './providerJson.ts';
import { fetchAirportByIata, fetchFlightByNumber, AERO_DATA_VERSION } from './aeroDataBox.ts';
import { getPlaceDetails } from './googlePlaces.ts';
import { createFlightEnrichmentResolver, ENRICHMENT_VERSION } from './flightEnrichment.ts';

const input = { flight_number: 'AA906', date: '2026-06-27', from_iata: 'GRU', to_iata: 'MIA', from_place_id: 'from', to_place_id: 'to' };
const failure = source => new ProviderFailure(source, 'RATE_LIMITED', 'Provider unavailable.', true, 429);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
function tracked(handler) {
  const result = (...args) => { result.calls.push(args); return handler(...args); };
  result.calls = [];
  return result;
}
function setup(overrides = {}) {
  const providers = {
    lookupFlight: tracked(async () => ({ airline: 'American Airlines', dep_iata: 'GRU', arr_iata: 'MIA' })),
    lookupAirport: tracked(async iata => ({ municipality: iata === 'GRU' ? 'São Paulo' : 'Miami', country: iata === 'GRU' ? 'BR' : 'US' })),
    lookupPlace: tracked(async id => ({ city: id === 'from' ? 'São Paulo' : 'Miami', country: id === 'from' ? 'BR' : 'US' })),
    helperVersion: AERO_DATA_VERSION, ...overrides,
  };
  return { providers, resolve: createFlightEnrichmentResolver(providers) };
}

test('provider errors remain distinct, with at most two HTTP attempts', async () => {
  assert.equal(await providerJson('https://provider.test', {}, 'source', async () => new Response('', { status: 404 })), null);
  for (const [status, code] of [[429, 'RATE_LIMITED'], [503, 'HTTP_503'], [403, 'HTTP_403']]) {
    const fetcher = tracked(async () => json({}, status));
    await assert.rejects(providerJson('https://provider.test', {}, 'source', fetcher), error => error.code === code && error.retryable === (status !== 403));
    assert.equal(fetcher.calls.length, status === 403 ? 1 : 2);
  }
  const network = tracked(async () => { throw new Error('offline'); });
  await assert.rejects(providerJson('https://provider.test', {}, 'source', network), { code: 'NETWORK_ERROR' });
  assert.equal(network.calls.length, 2);
  await assert.rejects(providerJson('https://provider.test', {}, 'source', async () => new Response('bad JSON')), { code: 'INVALID_JSON' });
});

test('actual municipalityName extraction and strict flight/Google shapes', async () => {
  const originalFetch = globalThis.fetch;
  const responses = [json({ iata: 'GRU', municipalityName: 'São Paulo', country: { code: 'BR' } }), json({ message: 'unexpected' }), json([]), json({ error: 'oops' }), json(null), json({}, 403), json({ id: 'p', addressComponents: [{ types: ['administrative_area_level_1'], longText: 'São Paulo', shortText: 'SP' }] })];
  globalThis.fetch = async () => responses.shift();
  try {
    assert.equal((await fetchAirportByIata('test-key', 'GRU')).municipality, 'São Paulo');
    await assert.rejects(fetchAirportByIata('test-key', 'GRU'), { code: 'INVALID_SHAPE', source: 'aerodatabox.airport' });
    assert.equal(await fetchFlightByNumber('test-key', 'AA906', input.date), null);
    await assert.rejects(fetchFlightByNumber('test-key', 'AA906', input.date), { code: 'INVALID_SHAPE' });
    await assert.rejects(fetchFlightByNumber('test-key', 'AA906', input.date), { code: 'INVALID_SHAPE' });
    await assert.rejects(getPlaceDetails('test-key', 'p'), { code: 'HTTP_403', source: 'google.places' });
    assert.equal((await getPlaceDetails('test-key', 'p')).city, '');
  } finally { globalThis.fetch = originalFetch; }
});

for (const mode of ['not_found', 'missing', 'failure']) {
  test(`Google fallback after IATA ${mode}`, async () => {
    const { resolve, providers } = setup({ lookupAirport: tracked(async () => {
      if (mode === 'failure') throw failure('aerodatabox.airport');
      return mode === 'not_found' ? null : { municipality: '', country: '' };
    }) });
    const result = await resolve(input);
    assert.equal(result.from_city, 'São Paulo');
    assert.equal(result.from_country, 'BR');
    assert.equal(result.to_city, 'Miami');
    assert.equal(result.to_country, 'US');
    assert.equal(providers.lookupPlace.calls.length, 2);
    assert.equal((mode === 'failure' ? result.errors : result.warnings).length, 2);
    assert.equal(result.cache.hit, false);
    assert.equal(result.version, ENRICHMENT_VERSION);
    assert.equal(result.helper_version, AERO_DATA_VERSION);
  });
}

test('partial successes retained; transient flight/Google failures not cached', async () => {
  let flightCalls = 0;
  let placeCalls = 0;
  const { resolve, providers } = setup({
    lookupFlight: tracked(async () => { if (!flightCalls++) throw failure('aerodatabox.flight'); return { airline: 'American Airlines' }; }),
    lookupAirport: tracked(async iata => { if (iata === 'GRU') return { municipality: 'São Paulo', country: 'BR' }; throw failure('aerodatabox.airport'); }),
    lookupPlace: tracked(async () => { if (!placeCalls++) throw failure('google.places'); return { city: 'Miami', country: 'US' }; }),
  });
  const first = await resolve(input);
  assert.equal(first.from_city, 'São Paulo');
  assert.equal(first.from_country, 'BR');
  assert.equal(first.to_city, '');
  assert.equal(first.to_country, '');
  assert.equal(first.airline, '');
  assert.ok(first.errors.some(error => error.source === 'google.places'));
  const second = await resolve(input);
  assert.equal(second.airline, 'American Airlines');
  assert.equal(second.to_city, 'Miami');
  assert.equal(second.to_country, 'US');
  assert.equal(second.cache.hit, false);
  assert.equal(providers.lookupFlight.calls.length, 2);
  assert.equal(providers.lookupAirport.calls.filter(([iata]) => iata === 'GRU').length, 1);
});

test('only complete verified results cache for ten minutes; dedupe and expiry', async () => {
  let time = 1000;
  const { resolve, providers } = setup({ now: () => time });
  const [first, duplicate] = await Promise.all([resolve(input), resolve(input)]);
  assert.deepEqual(first, duplicate);
  assert.equal(providers.lookupFlight.calls.length, 1);
  assert.deepEqual((await resolve(input)).cache, { hit: true, version: ENRICHMENT_VERSION });
  time += 600001;
  assert.equal((await resolve(input)).cache.hit, false);
  assert.equal(providers.lookupFlight.calls.length, 2);
});

test('blank fields and genuine missing records never become cached success', async () => {
  const { resolve, providers } = setup({ lookupFlight: tracked(async () => null), lookupAirport: tracked(async () => ({ municipality: '', country: '' })), lookupPlace: tracked(async () => ({ city: '', country: '' })) });
  const first = await resolve(input);
  const second = await resolve(input);
  assert.equal(first.errors.length, 0);
  assert.ok(first.warnings.some(issue => issue.code === 'NOT_FOUND'));
  assert.equal(second.cache.hit, false);
  assert.equal(providers.lookupFlight.calls.length, 2);
  assert.equal(providers.lookupAirport.calls.length, 4);
  assert.equal(providers.lookupPlace.calls.length, 4);
});

test('Bogotá->CO, Toronto->CA: country pairs with city from same authoritative source', async () => {
  const { resolve } = setup({
    lookupFlight: tracked(async () => ({ airline: 'Air Canada', dep_iata: 'BOG', arr_iata: 'YYZ' })),
    lookupAirport: tracked(async iata => ({
      municipality: iata === 'BOG' ? 'Bogotá' : 'Toronto',
      country: iata === 'BOG' ? 'CO' : 'CA',
    })),
  });
  const result = await resolve({ flight_number: 'AC095', date: '2026-07-08', from_iata: 'BOG', to_iata: 'YYZ', from_place_id: '', to_place_id: '' });
  assert.equal(result.from_city, 'Bogotá');
  assert.equal(result.from_country, 'CO');
  assert.equal(result.to_city, 'Toronto');
  assert.equal(result.to_country, 'CA');
});