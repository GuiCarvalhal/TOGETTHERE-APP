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
const ids = (bullets) => bullets.map((b) => b.id);
// Every clock time the featured card prints for a flight (dep in NY, arr in London).
const CARD_TIMES = ['1:10 PM', '6:40 AM'];

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

describe('buildBriefBullets — additive-only contract', () => {
  it('never restates a clock time the featured card prints', () => {
    const bullets = build(FLIGHT_ITEM, null);
    bullets.forEach((b) => {
      CARD_TIMES.forEach((shown) => expect(b.text).not.toContain(shown));
    });
  });

  it('drops a bullet that would repeat the card time instead of padding it back', () => {
    // No live data, no coordinates: the only candidates are the airport cutoff
    // and the "your own clock" line, which in this tz equals the arrival time on
    // the card and must therefore disappear.
    const live = {
      family: 'flight',
      origin: { source: 'home', label: 'Miami' },
      destination: { label: 'London', iata: 'LHR' },
      route: null,
    };
    const bullets = build(FLIGHT_ITEM, live);
    expect(bullets.length).toBeGreaterThanOrEqual(2);
    bullets.forEach((b) => {
      CARD_TIMES.forEach((shown) => expect(b.text).not.toContain(shown));
    });
  });

  it('keeps the check-out insight for a stay, which the card does not show', () => {
    const HOTEL = {
      id: 'h1', type: 'hotel', title: 'Hotel', confirmation_number: 'HTL99',
      start_datetime: '2026-11-13T15:00:00Z', end_datetime: '2026-11-16T10:00:00Z',
      place: { city: 'Rome', tz: 'Europe/Rome', lat: 41.9, lng: 12.5 },
    };
    const bullets = build(HOTEL, null);
    expect(ids(bullets)).toContain('checkout');
    // 16:00 Rome is the check-in time on the card (check-in leg) — never repeated.
    bullets.forEach((b) => expect(b.text).not.toContain('4:00 PM'));
  });
});

describe('buildBriefBullets — deterministic fallback', () => {
  it('returns concrete flight bullets without live data', () => {
    const bullets = build(FLIGHT_ITEM, null);
    expect(bullets.length).toBeGreaterThanOrEqual(2);
    expect(ids(bullets)).toContain('ground');
    // the 2h-before-airport cutoff is a derived time, never the departure itself
    expect(bullets.find((b) => b.id === 'ground').text).toContain('home.brief.flightBeThere');
    expect(bullets.find((b) => b.id === 'ground').text).toContain('cutoff=11:10 AM');
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
    // the origin city is already on the card's route line
    expect(ground.text).not.toContain('origin=');
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

  it('computes a leave-by time with the traffic delta and no origin repeat', () => {
    const bullets = build(FLIGHT_ITEM, live);
    const ground = bullets.find((b) => b.id === 'ground');
    expect(ground.text).toContain('home.brief.flightLeave');
    // 13:55 EDT minus 41 min traffic minus 120 min buffer = 11:14 AM
    expect(ground.text).toContain('leaveBy=11:14 AM');
    expect(ground.text).toContain('distance=18 mi');
    // 41 min in traffic vs 32 min free-flow = +9 min
    expect(ground.text).toContain('home.brief.trafficDelta');
    expect(ground.text).toContain('minutes=9');
    expect(ground.text).not.toContain('origin=');
  });

  it('adds weather, lounge and operational cutoffs, capped at five', () => {
    const bullets = build(FLIGHT_ITEM, live);
    expect(bullets).toHaveLength(5);
    expect(ids(bullets).slice(0, 4)).toEqual(['status', 'ground', 'weather', 'lounge']);
    const weather = bullets.find((b) => b.id === 'weather');
    expect(weather.text).toContain('temp=52°F');
    expect(weather.text).toContain('condition=overcast');
    // weather never repeats the arrival place or hour
    expect(weather.text).not.toContain('London');
    expect(weather.text).not.toContain('6:40 AM');
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
    expect(bullets[0].text).toContain('home.brief.flightCancelled');
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
    // never "Naples → Rome at 5:00 PM": that whole line is the card
    expect(bullets[0].text).not.toContain('Naples');
    expect(bullets.map((b) => b.text).join(' ')).not.toContain('5:00 PM');
  });

  it('states the timezone delta and the traveller’s own clock', () => {
    const bullets = build(DRIVE, null);
    expect(ids(bullets)).toContain('tz');
    expect(ids(bullets)).toContain('yourtime');
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
    expect(ids(bullets)).toContain('checkout');
    // the check-in time itself is on the card, so no check-in bullet
    expect(ids(bullets)).not.toContain('checkin');
  });

  it('asks for a home city when no origin could be resolved', () => {
    const ACTIVITY = { id: 'a1', type: 'activity', title: 'Dinner', start_datetime: '2026-11-13T20:00:00Z' };
    const bullets = build(ACTIVITY, { family: 'stay', origin: { source: 'none' }, destination: { label: '' } });
    expect(ids(bullets)).toContain('noOrigin');
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