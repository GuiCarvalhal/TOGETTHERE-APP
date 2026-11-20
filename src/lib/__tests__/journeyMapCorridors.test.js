import { describe, it, expect } from 'vitest';
import { mapRouteLegs, isSameCorridor, CORRIDOR_TOLERANCE_DEG } from '@/lib/journeyMap';

// A flown corridor must never also carry a road leg. Records describing the same
// corridor rarely store byte-identical coordinates (decimals, city-vs-airport
// resolution, direction), so suppression is decided by coordinate tolerance.

const P = (lat, lng, name = '') => ({ lat, lng, name });
const LHR = P(51.47, -0.4543, 'LHR');
const LHR_NEAR = P(51.47002, -0.45428, 'LHR');
const JFK = P(40.6413, -73.7781, 'JFK');
const JFK_NEAR = P(40.64128, -73.77809, 'JFK');
const LONDON_HOTEL = P(51.5074, -0.1278, 'London hotel');
const ROME_HOTEL = P(41.9028, 12.4964, 'Rome hotel');
const ROME_VENUE = P(41.8902, 12.4922, 'Rome venue');

const routeItem = (id, type, from, to, start) => ({
  id, type, start_datetime: start, from_place: from, to_place: to,
});
const driveLegs = (legs) => legs.filter((l) => l.kind === 'drive');
const flightLegs = (legs) => legs.filter((l) => l.kind === 'flight');

describe('mapRouteLegs — flown-corridor suppression', () => {
  it('suppresses the ground leg on an exact same pair (regression)', () => {
    const legs = mapRouteLegs([
      routeItem('car', 'car', LHR, JFK, '2026-05-01T00:00:00Z'),
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    expect(flightLegs(legs)).toHaveLength(1);
    // Both the car's own leg and the transfer back along the corridor are gone.
    expect(driveLegs(legs)).toHaveLength(0);
  });

  it('suppresses a ground leg whose endpoints differ only in decimals', () => {
    const legs = mapRouteLegs([
      routeItem('car', 'car', LHR, JFK_NEAR, '2026-05-01T00:00:00Z'),
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    expect(flightLegs(legs)).toHaveLength(1);
    expect(driveLegs(legs)).toHaveLength(0);
  });

  it('suppresses a near-duplicate drive leg running the corridor in reverse', () => {
    const legs = mapRouteLegs([
      routeItem('fl', 'flight', JFK, LHR, '2026-05-01T00:00:00Z'),
      routeItem('car', 'car', LHR, JFK_NEAR, '2026-05-01T03:00:00Z'),
    ]);
    expect(flightLegs(legs)).toHaveLength(1);
    expect(driveLegs(legs)).toHaveLength(0);
  });

  it('keeps a real ground transfer next to the flown airport', () => {
    const legs = mapRouteLegs([
      routeItem('car', 'car', LONDON_HOTEL, LHR, '2026-05-01T00:00:00Z'),
      routeItem('fl', 'flight', LHR, JFK, '2026-05-01T03:00:00Z'),
    ]);
    const drives = driveLegs(legs);
    expect(drives).toHaveLength(1);
    // Cache key stays the exact pair, so route lookups are unchanged.
    expect(drives[0].key).toBe(`${LONDON_HOTEL.lat},${LONDON_HOTEL.lng}|${LHR.lat},${LHR.lng}`);
  });

  it('leaves non-flight legs untouched when nothing is flown', () => {
    const legs = mapRouteLegs([
      routeItem('a', 'activity', ROME_HOTEL, ROME_VENUE, '2026-05-01T00:00:00Z'),
      routeItem('b', 'car', ROME_VENUE, ROME_HOTEL, '2026-05-01T05:00:00Z'),
    ]);
    expect(flightLegs(legs)).toHaveLength(0);
    expect(driveLegs(legs).length).toBeGreaterThan(0);
  });
});

describe('isSameCorridor — tolerance identity', () => {
  const leg = (from, to) => ({ from, to });

  it('matches near-equal endpoints in either direction', () => {
    expect(isSameCorridor(leg(LHR, JFK), leg(LHR_NEAR, JFK_NEAR))).toBe(true);
    expect(isSameCorridor(leg(LHR_NEAR, JFK_NEAR), leg(JFK, LHR))).toBe(true);
  });

  it('does not match clearly different endpoints', () => {
    expect(isSameCorridor(leg(LONDON_HOTEL, LHR), leg(LHR, JFK))).toBe(false);
    expect(isSameCorridor(leg(ROME_HOTEL, ROME_VENUE), leg(LHR, JFK))).toBe(false);
  });

  it('honours a custom tolerance', () => {
    const a = leg(P(51.5, -0.3), LHR);
    const b = leg(P(51.5, -0.05), LHR);
    expect(CORRIDOR_TOLERANCE_DEG).toBe(0.1);
    expect(isSameCorridor(a, b)).toBe(false);
    expect(isSameCorridor(a, b, 0.3)).toBe(true);
  });
});