import { describe, it, expect } from 'vitest';
import {
  buildDayLegs, computeDayTotals, formatDistanceMeters, formatDurationSeconds,
  arrivalPoint, departurePoint, arrivalString, departureString,
} from '@/lib/journeyDistance';

// Fixtures: minimal journey-item shapes (only the fields the helpers read).
const flight = (over = {}) => ({
  type: 'flight',
  title: 'Flight',
  from_place: { lat: 40.64, lng: -73.78, name: 'JFK', tz: 'America/New_York' },
  to_place: { lat: 40.84, lng: 14.25, name: 'NAP', tz: 'Europe/Rome' },
  location_from: 'JFK', location_to: 'NAP',
  ...over,
});
const hotel = (over = {}) => ({
  type: 'hotel',
  title: 'Hotel',
  place: { lat: 40.63, lng: 14.4, name: 'Hotel Santa Caterina', tz: 'Europe/Rome' },
  location_name: 'Amalfi Hotel',
  ...over,
});
const activity = (over = {}) => ({
  type: 'activity',
  title: 'Cooking class',
  place: { lat: 40.70, lng: 14.60, name: 'Ravello class', tz: 'Europe/Rome' },
  location_name: 'Ravello',
  ...over,
});
const drive = (over = {}) => ({
  type: 'car',
  title: 'Drive',
  from_place: { lat: 40.63, lng: 14.4, name: 'Amalfi' },
  to_place: { lat: 40.75, lng: 14.78, name: 'Salerno' },
  location_from: 'Amalfi', location_to: 'Salerno',
  ...over,
});
const noCoords = (over = {}) => ({
  type: 'activity',
  title: 'Mystery spot',
  place: null,
  location_name: '',
  ...over,
});

const entry = (item, dayKey) => ({ key: item.id || item.title, leg: null, at: '2026-07-15T10:00:00', item: item, dayKey });

describe('arrivalPoint / departurePoint', () => {
  it('route items arrive at destination, depart from origin', () => {
    const f = flight();
    expect(arrivalPoint(f)).toEqual(f.to_place);
    expect(departurePoint(f)).toEqual(f.from_place);
    const d = drive();
    expect(arrivalPoint(d)).toEqual(d.to_place);
    expect(departurePoint(d)).toEqual(d.from_place);
  });
  it('point items use place for both', () => {
    const h = hotel();
    expect(arrivalPoint(h)).toEqual(h.place);
    expect(departurePoint(h)).toEqual(h.place);
  });
  it('null when no place stored', () => {
    expect(arrivalPoint(noCoords())).toBeNull();
    expect(departurePoint(noCoords())).toBeNull();
  });
});

describe('arrivalString / departureString', () => {
  it('uses lat,lng when coords present', () => {
    expect(arrivalString(flight())).toBe('40.84,14.25');
    expect(departureString(flight())).toBe('40.64,-73.78');
  });
  it('falls back to free-text when no coords', () => {
    expect(arrivalString(noCoords())).toBe('');
    expect(departureString(noCoords())).toBe('');
  });
  it('falls back to location_to for a route item missing coords', () => {
    const f = flight({ to_place: null });
    expect(arrivalString(f)).toBe('NAP');
  });
});

describe('buildDayLegs', () => {
  it('builds a leg between consecutive same-day entries', () => {
    const legs = buildDayLegs([entry(hotel(), '2026-07-15'), entry(activity(), '2026-07-15')]);
    expect(legs).toHaveLength(1);
    expect(legs[0].dayKey).toBe('2026-07-15');
    // origin = hotel arrival (place lat,lng), destination = activity departure (place lat,lng)
    expect(legs[0].origin).toBe('40.63,14.4');
    expect(legs[0].destination).toBe('40.7,14.6');
    expect(legs[0].samePlace).toBe(false);
  });
  it('a flight between two point items uses the airports as leg endpoints, not the flight as a ground route', () => {
    // hotel -> flight -> activity on the same day
    const legs = buildDayLegs([
      entry(hotel(), '2026-07-15'),
      entry(flight(), '2026-07-15'),
      entry(activity(), '2026-07-15'),
    ]);
    expect(legs).toHaveLength(2);
    // leg 1: hotel arrival -> flight DEPARTURE (origin airport) — drive to airport
    expect(legs[0].origin).toBe('40.63,14.4');
    expect(legs[0].destination).toBe('40.64,-73.78');
    // leg 2: flight ARRIVAL (destination airport) -> activity — drive from airport
    expect(legs[1].origin).toBe('40.84,14.25');
    expect(legs[1].destination).toBe('40.7,14.6');
  });
  it('same origin/destination is flagged samePlace (skipped, known zero)', () => {
    const a = activity({ place: { lat: 40.70, lng: 14.60, name: 'X' } });
    const b = activity({ place: { lat: 40.70, lng: 14.60, name: 'Y' } });
    const legs = buildDayLegs([entry(a, '2026-07-15'), entry(b, '2026-07-15')]);
    expect(legs).toHaveLength(1);
    expect(legs[0].samePlace).toBe(true);
  });
  it('no legs for a single-entry day', () => {
    expect(buildDayLegs([entry(hotel(), '2026-07-15')])).toEqual([]);
  });
  it('legs stay within their day (cross-day pairs are not built)', () => {
    const legs = buildDayLegs([
      entry(hotel(), '2026-07-15'),
      entry(activity(), '2026-07-16'),
    ]);
    expect(legs).toEqual([]);
  });
});

describe('computeDayTotals', () => {
  it('sums distance + duration of routed legs (ready)', () => {
    const legs = buildDayLegs([entry(hotel(), '2026-07-15'), entry(activity(), '2026-07-15')]);
    const results = [{ ok: true, distanceMeters: 15000, durationSeconds: 1200 }];
    const totals = computeDayTotals(legs, results);
    const d = totals['2026-07-15'];
    expect(d.state).toBe('ready');
    expect(d.distanceMeters).toBe(15000);
    expect(d.durationSeconds).toBe(1200);
  });
  it('a missing-endpoint leg is unknown, NOT zero — day is partial', () => {
    const legs = buildDayLegs([
      entry(hotel(), '2026-07-15'),
      entry(noCoords(), '2026-07-15'),
    ]);
    // one leg, origin present, destination empty -> missing endpoint
    expect(legs[0].destination).toBe('');
    const totals = computeDayTotals(legs, []);
    const d = totals['2026-07-15'];
    expect(d.state).toBe('unavailable');
    expect(d.distanceMeters).toBe(0);
  });
  it('a failed route (ok:false) is unknown, not zero — partial when mixed', () => {
    const legs = [
      { dayKey: 'd', idx: 0, origin: 'a', destination: 'b', samePlace: false },
      { dayKey: 'd', idx: 1, origin: 'c', destination: 'e', samePlace: false },
    ];
    const results = [
      { ok: true, distanceMeters: 5000, durationSeconds: 600 },
      { ok: false, reason: 'no_route' },
    ];
    const totals = computeDayTotals(legs, results);
    expect(totals.d.state).toBe('partial');
    expect(totals.d.distanceMeters).toBe(5000);
  });
  it('null results (call failed) make every fetchable leg unknown', () => {
    const legs = [{ dayKey: 'd', idx: 0, origin: 'a', destination: 'b', samePlace: false }];
    const totals = computeDayTotals(legs, null);
    expect(totals.d.state).toBe('unavailable');
  });
  it('samePlace legs are a known zero and do not make the day incomplete', () => {
    const legs = [{ dayKey: 'd', idx: 0, origin: 'x', destination: 'x', samePlace: true }];
    const totals = computeDayTotals(legs, []);
    expect(totals.d.state).toBe('ready');
    expect(totals.d.distanceMeters).toBe(0);
  });
  it('a day with no inter-segment legs is none', () => {
    expect(computeDayTotals([], [])).toEqual({});
  });
});

describe('formatters', () => {
  it('formats km for non-en locale', () => {
    expect(formatDistanceMeters(15000, 'pt-BR')).toBe('15 km');
    expect(formatDistanceMeters(1500, 'pt-BR')).toBe('1.5 km');
    expect(formatDistanceMeters(150000, 'pt-BR')).toBe('150 km');
  });
  it('formats miles for en locale', () => {
    expect(formatDistanceMeters(1609.344, 'en')).toBe('1.0 mi');
    expect(formatDistanceMeters(160934, 'en')).toBe('100 mi');
  });
  it('formats duration as h+m', () => {
    expect(formatDurationSeconds(1200)).toBe('20 min');
    expect(formatDurationSeconds(3600)).toBe('1h');
    expect(formatDurationSeconds(5400)).toBe('1h 30m');
  });
  it('empty for null/invalid', () => {
    expect(formatDistanceMeters(null, 'en')).toBe('');
    expect(formatDurationSeconds(null)).toBe('');
  });
});