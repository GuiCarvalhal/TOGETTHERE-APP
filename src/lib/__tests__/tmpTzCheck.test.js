import { describe, it } from 'vitest';
import { buildBriefBullets } from '../nextBriefBullets';
import { en } from '../i18n/en';

const get = (obj, path) => path.split('.').reduce((a, k) => (a ? a[k] : undefined), obj);
const t = (key, vars) => {
  const s = get(en, key);
  if (typeof s !== 'string') return `${key}|${JSON.stringify(vars || {})}`;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
};

const item = {
  id: 'x', type: 'flight', title: 'Flight AA1684 - American Airlines',
  confirmation_number: 'AA1684', booking_reference: 'CBDTQI',
  start_datetime: '2026-11-20T07:53:00.000Z', end_datetime: '2026-11-20T13:19:00.000Z',
  from_place: { tz: 'America/Los_Angeles', country: 'US', city: 'San Francisco', lat: 37.6, lng: -122.4, iata: 'SFO' },
  to_place: { tz: 'America/New_York', country: 'US', city: 'Miami', lat: 25.8, lng: -80.3, iata: 'MIA' },
};
const live = {
  origin: { source: 'home', label: 'Home', tz: 'America/Los_Angeles', point: { lat: 37.7, lng: -122.4 } },
  destination: { label: 'Miami', iata: 'MIA', tz: 'America/New_York', point: { lat: 25.8, lng: -80.3 } },
  route: {
    distance: '18 mi', distanceMeters: 28968, duration: '32 mins', durationSeconds: 1920,
    durationInTraffic: '41 mins', durationInTrafficSeconds: 2460,
  },
  flight: {
    status: 'Boarding', lastUpdatedUtc: '2026-11-20T07:40:00Z',
    departure: { scheduled: '2026-11-19 23:53-08:00', terminal: '1', gate: 'B24' }, arrival: {},
  },
  weather: { tempC: 27, tempF: 80, code: 0 },
  lounge: { name: 'Admirals Club', terminal: '1' },
};

describe('tmp tz check', () => {
  it('prints the bullets', () => {
    const bullets = buildBriefBullets({ item, live, unit: 'mi', t, now: new Date('2026-11-20T07:50:00Z') });
    console.log(bullets.map((b) => `${b.id}: ${b.text}`).join('\n'));
  });
});