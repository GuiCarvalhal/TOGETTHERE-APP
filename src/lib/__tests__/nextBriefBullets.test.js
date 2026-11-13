import { describe, it, expect } from 'vitest';
import { buildBriefBullets, briefFamily, wmoKey } from '../nextBriefBullets';

// Translator stand-in. Duration and weather templates resolve like the real
// dictionary so nested helper calls read naturally; every other template comes
// back as "key|vars" so assertions can check WHICH template was chosen and what
// numbers were passed in.
const TEMPLATES = {
  'home.brief.min': '{count} min',
  'home.brief.hours': '{count} h',
  'home.brief.hourMin': '{hours} h {minutes} min',
  'home.brief.wmo.clear': 'clear',
  'home.brief.wmo.partly': 'partly cloudy',
  'home.brief.wmo.cloudy': 'overcast',
  'home.brief.wmo.rain': 'rain',
  'home.brief.wmo.storm': 'thunderstorms',
};
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
const t = (key, vars = {}) => {
  if (TEMPLATES[key]) return fill(TEMPLATES[key], vars);
  const pairs = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',');
  return `${key}|${pairs}`;
};
const NOW = new Date('2026-11-13T15:00:00Z');
const build = (item, live, unit = 'mi') => buildBriefBullets({ item, live, unit, t, now: NOW });

const FLIGHT_ITEM = {
  id: 'i1',
  type: 'flight',
  title: 'BA208',
  confirmation_number: 'BA208',
  airline: 'British Airways',
  start_datetime: '2026-11-13T18:10:00Z',
  end_datetime: '2026-11-14T06:40:00Z',
  from_place: { iata: 'MIA', city: 'Miami', tz: 'America/New_York', lat: 25.79, lng: -80.29 },
  to_place: { iata: 'LHR', city: 'London', tz: 'Europe/London', lat: 51.47, lng: -0.45 },
};

describe('briefFamily', () => {
  it('maps item types to families', () => {
    expect(briefFamily('flight')).toBe('flight');
    expect(briefFamily('car')).toBe('transfer');
    expect(briefFamily('train')).toBe('transfer');
    expect(briefFamily('cruise')).toBe('transfer');
    expect(briefFamily('hotel')).toBe('stay');
    expect(briefFamily('activity')).toBe('stay');
    expect(briefFamily('other')).toBe('stay');
  });
});

describe('buildBriefBullets — deterministic fallback', () => {
  it('returns at least three concrete flight bullets with no live data', () => {
    const bullets = build(FLIGHT_ITEM, null);
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    const ids = bullets.map((b) => b.id);
    expect(ids).toContain('status');
    // scheduled departure carries the real clock time, not advice
    expect(bullets[0].text).toContain('home.brief.flightScheduled');
    expect(bullets[0].text).toContain('time=1:10 PM');
    expect(ids).toContain('ground');
  });

  it('falls back to a straight-line distance when routing is unavailable', () => {
    const bullets = build(FLIGHT_ITEM, {
      family: 'flight',
      origin: { source: 'home', label: 'Miami', point: { lat: 25.76, lng: -80.19 } },
      destination: { label: 'London', point: { lat: 51.47, lng: -0.45 } },
      route: null,
    });
    const ground = bullets.find((b) => b.id === 'ground');
    expect(ground.text).toContain('home.brief.flightLeaveApprox');
    expect(ground.text).toMatch(/distance=\d/);
  });
});

describe('buildBriefBullets — live flight data', () => {
  const live = {
    family: 'flight',
    origin: { source: 'home', label: 'Miami', tz: 'America/New_York' },
    destination: { label: 'London', iata: 'LHR', tz: 'Europe/London' },
    route: {
      distance: '18 mi', distanceMeters: 28968,
      duration: '32 mins', durationSeconds: 1920,
      durationInTraffic: '41 mins', durationInTrafficSeconds: 2460,
    },
    flight: {
      status: 'Delayed',
      airline: 'British Airways',
      lastUpdatedUtc: '2026-11-13T14:40:00Z',
      departure: {
        scheduled: '2026-11-13 13:10-05:00',
        revised: '2026-11-13 13:55-05:00',
        terminal: 'D', gate: 'D12',
      },
      arrival: { terminal: '3' },
    },
    weather: { tempC: 11, tempF: 52, code: 3, tz: 'Europe/London' },
    lounge: { name: 'Galleries Club', terminal: 'D' },
  };

  it('shows the delay in minutes and the revised departure', () => {
    const bullets = build(FLIGHT_ITEM, live);
    const status = bullets.find((b) => b.id === 'status');
    expect(status.text).toContain('home.brief.flightDelayed');
    expect(status.text).toContain('minutes=45');
    expect(status.text).toContain('time=1:55 PM');
  });

  it('computes a leave-by time from traffic ETA plus the airport buffer', () => {
    const bullets = build(FLIGHT_ITEM, live);
    const ground = bullets.find((b) => b.id === 'ground');
    expect(ground.text).toContain('home.brief.flightLeave');
    expect(ground.text).toContain('origin=Miami');
    // 13:55 EDT minus 41 min traffic minus 120 min buffer = 11:14 AM
    expect(ground.text).toContain('leaveBy=11:14 AM');
    expect(ground.text).toContain('distance=18 mi');
  });

  it('adds weather, lounge and feed freshness, capped at five bullets', () => {
    const bullets = build(FLIGHT_ITEM, live);
    expect(bullets).toHaveLength(5);
    expect(bullets.map((b) => b.id)).toEqual(['status', 'ground', 'weather', 'lounge', 'feed']);
    expect(bullets.find((b) => b.id === 'weather').text).toContain('temp=52°F');
    expect(bullets.find((b) => b.id === 'weather').text).toContain('condition=overcast');
    expect(bullets.find((b) => b.id === 'feed').text).toContain('minutes=20');
  });

  it('uses Celsius for metric users', () => {
    const bullets = build(FLIGHT_ITEM, live, 'km');
    expect(bullets.find((b) => b.id === 'weather').text).toContain('temp=11°C');
  });

  it('reports a cancellation instead of a departure time', () => {
    const bullets = build(FLIGHT_ITEM, {
      ...live,
      flight: { ...live.flight, status: 'Canceled', departure: { ...live.flight.departure, gate: '' } },
    });
    expect(bullets[0].text).toContain('home.brief.flightCancelledAirline');
  });
});

describe('buildBriefBullets — other families', () => {
  const DRIVE = {
    id: 'd1', type: 'car', title: 'Drive to Rome',
    start_datetime: '2026-11-13T16:00:00Z', end_datetime: '2026-11-13T18:30:00Z',
    from_place: { city: 'Naples', tz: 'Europe/Rome', lat: 40.85, lng: 14.26 },
    to_place: { city: 'Rome', tz: 'Europe/Rome', lat: 41.9, lng: 12.5 },
  };

  it('keeps transfer bullets concrete without live data', () => {
    const bullets = build(DRIVE, null);
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets[0].text).toContain('home.brief.transferTimingApprox');
    expect(bullets[1].text).toContain('home.brief.transferArrive');
  });

  it('states travel time from the resolved origin for a stay', () => {
    const HOTEL = {
      id: 'h1', type: 'hotel', title: 'Hotel', confirmation_number: 'HTL99',
      start_datetime: '2026-11-13T15:00:00Z', end_datetime: '2026-11-16T10:00:00Z',
      place: { city: 'Rome', tz: 'Europe/Rome', lat: 41.9, lng: 12.5 },
    };
    const bullets = build(HOTEL, {
      family: 'stay',
      origin: { source: 'prior', label: 'Naples', point: { lat: 40.85, lng: 14.26 } },
      destination: { label: 'Rome', point: { lat: 41.9, lng: 12.5 } },
      route: { distanceMeters: 220000, durationSeconds: 9000, durationInTrafficSeconds: 10800 },
    });
    expect(bullets[0].text).toContain('home.brief.stayTravel');
    expect(bullets[0].text).toContain('duration=3 h');
    expect(bullets.map((b) => b.id)).toContain('checkin');
    expect(bullets.map((b) => b.id)).toContain('checkout');
  });

  it('asks for a home city when no origin could be resolved', () => {
    const ACTIVITY = { id: 'a1', type: 'activity', title: 'Dinner', start_datetime: '2026-11-13T20:00:00Z' };
    const bullets = build(ACTIVITY, { family: 'stay', origin: { source: 'none' }, destination: { label: '' } });
    expect(bullets.map((b) => b.id)).toContain('noOrigin');
    expect(bullets.length).toBeGreaterThanOrEqual(3);
  });
});

describe('wmoKey', () => {
  it('maps WMO codes to condition keys', () => {
    expect(wmoKey(0)).toBe('clear');
    expect(wmoKey(3)).toBe('cloudy');
    expect(wmoKey(63)).toBe('rain');
    expect(wmoKey(95)).toBe('storm');
    expect(wmoKey(null)).toBe('');
  });
});