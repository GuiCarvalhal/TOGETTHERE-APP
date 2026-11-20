import { describe, it, expect } from 'vitest';
import {
  mapRouteLegs, endpointMatch, isEquivalentCorridor, explainCorridorMatch,
  corridorToleranceKm, haversineKm, CORRIDOR_TOLERANCE_KM,
} from '@/lib/journeyMap';

// A flown corridor must never also carry a road leg. Records describing the same
// corridor disagree on coordinates (airport vs city centroid, decimals, reverse
// direction), so equivalence is layered: IATA → city+country → name → adaptive
// geography, failing closed on weak data.

const JFK = { lat: 40.6413, lng: -73.7781, name: 'John F. Kennedy International Airport', iata: 'JFK', city: 'New York', country: 'US' };
const NYC_CITY = { lat: 40.7128, lng: -74.006, name: 'New York', city: 'New York', country: 'US' };
const LHR = { lat: 51.47, lng: -0.4543, name: 'Heathrow Airport', iata: 'LHR', city: 'London', country: 'GB' };
const LONDON_CITY = { lat: 51.5074, lng: -0.1278, name: 'London', city: 'London', country: 'GB' };
const LONDON_HOTEL = { lat: 51.5074, lng: -0.1278, name: 'The Hoxton Shoreditch', city: 'London', country: 'GB' };
const ROME_HOTEL = { lat: 41.9028, lng: 12.4964, name: 'Hotel Artemide', city: 'Rome', country: 'IT' };
const ROME_VENUE = { lat: 41.8902, lng: 12.4922, name: 'Colosseo', city: 'Rome', country: 'IT' };
// Same airport codes, coordinates drifted far beyond any geo tolerance.
const JFK_DRIFTED = { lat: 41.2, lng: -74.9, iata: 'JFK' };

const routeItem = (id, type, from, to, start) => ({
  id, type, start_datetime: start, from_place: from, to_place: to,
});
const drives = (legs) => legs.filter((l) => l.kind === 'drive');
const flights = (legs) => legs.filter((l) => l.kind === 'flight');

describe('mapRouteLegs — flown-corridor suppression', () => {
  it('1. suppresses the ground leg on an exact same pair', () => {
    const legs = mapRouteLegs([
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T00:00:00Z'),
      routeItem('car', 'car', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    expect(flights(legs)).toHaveLength(1);
    expect(drives(legs)).toHaveLength(0);
  });

  it('2. suppresses airport-vs-city drift on a long-haul corridor', () => {
    // NYC centroid → JFK is ~19 km: the case a single fixed degree tolerance missed.
    expect(haversineKm(NYC_CITY, JFK)).toBeGreaterThan(15);
    const legs = mapRouteLegs([
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T00:00:00Z'),
      routeItem('car', 'car', LONDON_CITY, NYC_CITY, '2026-05-01T03:00:00Z'),
    ]);
    expect(drives(legs)).toHaveLength(0);
  });

  it('3. suppresses a reverse-direction equivalent corridor', () => {
    const legs = mapRouteLegs([
      routeItem('fl', 'flight', JFK, LHR, '2026-05-01T00:00:00Z'),
      routeItem('car', 'car', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    expect(drives(legs)).toHaveLength(0);
  });

  it('4. keeps a nearby-but-different local transfer (hotel → airport)', () => {
    const legs = mapRouteLegs([
      routeItem('car', 'car', LONDON_HOTEL, LHR, '2026-05-01T00:00:00Z'),
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    const kept = drives(legs);
    expect(kept).toHaveLength(1);
    // Cache key semantics unchanged: the exact routable pair.
    expect(kept[0].key).toBe(`${LONDON_HOTEL.lat},${LONDON_HOTEL.lng}|${LHR.lat},${LHR.lng}`);
  });

  it('5. leaves a pure ground journey unchanged', () => {
    const legs = mapRouteLegs([
      routeItem('car', 'car', ROME_HOTEL, ROME_VENUE, '2026-05-01T00:00:00Z'),
      routeItem('train', 'train', ROME_VENUE, ROME_HOTEL, '2026-05-01T05:00:00Z'),
    ]);
    expect(flights(legs)).toHaveLength(0);
    expect(drives(legs)).toHaveLength(2);
  });

  it('6. suppresses on an IATA match even when coordinates differ far beyond geo tolerance', () => {
    const tol = corridorToleranceKm(haversineKm(JFK, LHR));
    expect(haversineKm(JFK_DRIFTED, JFK)).toBeGreaterThan(tol);
    const legs = mapRouteLegs([
      routeItem('fl', 'flight', JFK, LHR, '2026-05-01T00:00:00Z'),
      routeItem('car', 'car', JFK_DRIFTED, LHR, '2026-05-01T03:00:00Z'),
    ]);
    expect(drives(legs)).toHaveLength(0);
  });
});

describe('corridor identity layers', () => {
  const leg = (kind, from, to) => ({ kind, from, to });

  it('matches by IATA, city+country and geography, in that order', () => {
    expect(endpointMatch(JFK, { lat: 40.66, lng: -73.79, iata: 'JFK' })).toMatchObject({ matched: true, by: 'iata' });
    expect(endpointMatch(JFK, NYC_CITY)).toMatchObject({ matched: true, by: 'city' });
    expect(endpointMatch(LHR, { lat: 51.47, lng: -0.45 })).toMatchObject({ matched: true, by: 'geo' });
  });

  it('fails closed on weak or conflicting data', () => {
    // No metadata, far apart.
    expect(endpointMatch({ lat: 51.5, lng: -0.1 }, { lat: 40.6, lng: -73.8 })).toMatchObject({ matched: false, by: 'none' });
    // Two different airport codes are a hard no.
    expect(endpointMatch(JFK, LHR)).toMatchObject({ matched: false, by: 'iata_conflict' });
    // Same city name in different countries never matches semantically.
    expect(endpointMatch(
      { lat: 51.5, lng: -0.1, city: 'Springfield', country: 'GB' },
      { lat: 39.8, lng: -89.6, city: 'Springfield', country: 'US' },
    ).matched).toBe(false);
  });

  it('isEquivalentCorridor is undirected and only compares flight ↔ drive', () => {
    const flight = leg('flight', JFK, LHR);
    expect(isEquivalentCorridor(flight, leg('drive', LHR, JFK))).toBe(true);
    expect(isEquivalentCorridor(flight, leg('drive', LONDON_HOTEL, LHR))).toBe(false);
    expect(isEquivalentCorridor(leg('drive', JFK, LHR), leg('drive', JFK, LHR))).toBe(false);
  });

  it('adapts the geo tolerance to the corridor length', () => {
    expect(CORRIDOR_TOLERANCE_KM).toEqual({ min: 10, max: 60, factor: 0.02 });
    expect(corridorToleranceKm(20)).toBe(10);
    expect(corridorToleranceKm(1000)).toBe(20);
    expect(corridorToleranceKm(5550)).toBe(60);
  });
});

describe('explainCorridorMatch — diagnostics', () => {
  it('reports the deciding layer and direction for a suppressed leg', () => {
    const flight = { kind: 'flight', from: JFK, to: LHR };
    const cityDrive = { kind: 'drive', from: NYC_CITY, to: LONDON_CITY };
    const explained = explainCorridorMatch([flight], cityDrive);
    expect(explained.matched).toBe(true);
    expect(explained.reason).toBe('semantic_city');
    expect(explained.direction).toBe('forward');
    expect(explained.endpoints.map((e) => e.by)).toEqual(['city', 'city']);

    const iataDrive = { kind: 'drive', from: JFK_DRIFTED, to: LHR };
    const byIata = explainCorridorMatch([flight], iataDrive);
    expect(byIata).toMatchObject({ matched: true, reason: 'semantic_iata' });
  });

  it('explains a non-match instead of silently suppressing', () => {
    const flight = { kind: 'flight', from: LHR, to: JFK };
    const transfer = { kind: 'drive', from: LONDON_HOTEL, to: LHR };
    const explained = explainCorridorMatch([flight], transfer);
    expect(explained.matched).toBe(false);
    expect(explained.reason).toBe('no_match');
    // The airport endpoint agreed, the far endpoint is what saved the transfer.
    expect(explained.hits).toBe(1);
  });

  it('reports no_flights when nothing is flown', () => {
    expect(explainCorridorMatch([], { kind: 'drive', from: JFK, to: LHR })).toMatchObject({ matched: false, reason: 'no_flights' });
  });
});