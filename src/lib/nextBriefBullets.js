import { formatTimeTz, tzAbbrAt } from './formatPlaceTime';
import { formatDistanceMeters } from './journeyDistance';

// Builds Home's "Next / Now" bullets from the segment plus the LIVE payload
// returned by the getNextBrief function (flight status, traffic ETA, weather,
// lounge). Pure and deterministic: every family always yields at least three
// concrete bullets from whatever is known, and NO bullet is ever generic filler
// — when a live source is missing the bullet states a real time, distance,
// schedule delta or constraint instead of advice.
//
// Returns [{ id, icon, text }] with `text` already translated (the component
// only renders it), capped at 5 bullets.

export const FLIGHT = 'flight';
export const TRANSFER = 'transfer';
export const STAY = 'stay';

const TRANSFER_TYPES = ['car', 'train', 'cruise'];
const AIRPORT_BUFFER_MIN = 120;
const CHECKIN_CLOSE_MIN = 60;

export function briefFamily(type) {
  if (type === FLIGHT) return FLIGHT;
  if (TRANSFER_TYPES.includes(type)) return TRANSFER;
  return STAY;
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// AeroDataBox local strings look like "2026-11-13 18:10+01:00".
function providerInstant(raw) {
  if (!raw) return null;
  const s = String(raw).replace(' ', 'T').replace(/(\d{2}:\d{2})([+-]\d{2}:\d{2})$/, '$1:00$2');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function timeIn(iso, tz) {
  if (!iso) return '';
  if (tz) {
    const formatted = formatTimeTz(iso, tz);
    if (formatted) return formatted;
  }
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

function timeOnly(ms, tz) {
  if (num(ms) === null) return '';
  return timeIn(new Date(ms).toISOString(), tz);
}

function abbrIn(iso, tz) {
  if (!iso || !tz) return '';
  return tzAbbrAt(iso, tz);
}

function durLabel(seconds, t) {
  const s = num(seconds);
  if (!s) return '';
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return t('home.brief.min', { count: mins });
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest
    ? t('home.brief.hourMin', { hours, minutes: rest })
    : t('home.brief.hours', { count: hours });
}

function distLabel(meters, unit) {
  const m = num(meters);
  return m === null ? '' : formatDistanceMeters(m, unit);
}

function haversineMeters(a, b) {
  if (!a || !b || num(a.lat) === null || num(a.lng) === null || num(b.lat) === null || num(b.lng) === null) return null;
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const WMO_KEYS = [
  [0, 'clear'], [1, 'clear'], [2, 'partly'], [3, 'cloudy'], [45, 'fog'], [48, 'fog'],
  [51, 'drizzle'], [53, 'drizzle'], [55, 'drizzle'], [56, 'drizzle'], [57, 'drizzle'],
  [61, 'rain'], [63, 'rain'], [65, 'rain'], [66, 'rain'], [67, 'rain'],
  [71, 'snow'], [73, 'snow'], [75, 'snow'], [77, 'snow'], [85, 'snow'], [86, 'snow'],
  [80, 'showers'], [81, 'showers'], [82, 'showers'],
  [95, 'storm'], [96, 'storm'], [99, 'storm'],
];

export function wmoKey(code) {
  if (num(code) === null) return '';
  const hit = WMO_KEYS.find(([c]) => c === code);
  return hit ? hit[1] : '';
}

// "18°C" or "64°F" — the user's distance unit decides the scale (metric → °C).
function tempLabel(weather, unit) {
  if (!weather) return '';
  const metric = unit === 'km' || /^pt/i.test(String(unit));
  const value = metric ? num(weather.tempC) : num(weather.tempF);
  if (value === null) return '';
  return `${Math.round(value)}°${metric ? 'C' : 'F'}`;
}

function weatherBullet({ weather, city, iso, tz, unit, t }) {
  const temp = tempLabel(weather, unit);
  const kind = wmoKey(weather?.code);
  if (!temp || !kind) return null;
  const condition = t(`home.brief.wmo.${kind}`);
  const time = timeIn(iso, tz || weather.tz);
  const abbr = abbrIn(iso, tz || weather.tz);
  return {
    id: 'weather',
    icon: 'weather',
    text: city
      ? t('home.brief.weatherLine', { city, time, abbr, temp, condition })
      : t('home.brief.weatherLineNoCity', { time, abbr, temp, condition }),
  };
}

function freshnessBullet(flight, t, now) {
  const updated = providerInstant(flight?.lastUpdatedUtc);
  if (!updated) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - updated.getTime()) / 60000));
  if (minutes <= 2) return { id: 'feed', icon: 'feed', text: t('home.brief.updatedNow') };
  if (minutes > 720) return null;
  return { id: 'feed', icon: 'feed', text: t('home.brief.updatedAgo', { minutes }) };
}

function fillToThree(list, extras) {
  if (list.length >= 3) return list;
  for (const extra of extras) {
    if (list.length >= 3) break;
    if (extra && !list.some((b) => b.id === extra.id)) list.push(extra);
  }
  return list;
}

function flightBullets({ item, live, unit, t, now }) {
  const depTz = text(item.from_place?.tz) || text(live?.origin?.tz);
  const arrTz = text(item.to_place?.tz) || text(live?.destination?.tz);
  const flight = live?.flight || null;
  const dep = flight?.departure || null;
  const airline = text(item.airline) || text(flight?.airline);
  const terminal = text(dep?.terminal);
  const gate = text(dep?.gate);
  const originLabel = text(live?.origin?.label) || text(item.from_place?.city) || text(item.location_from);
  const airport = text(live?.destination?.iata) || text(item.from_place?.iata)
    || text(item.from_place?.name) || originLabel;

  const schedMs = providerInstant(dep?.scheduled)?.getTime()
    ?? (item.start_datetime ? new Date(item.start_datetime).getTime() : null);
  const revised = providerInstant(dep?.revised) || providerInstant(dep?.actual);
  const depMs = revised ? revised.getTime() : schedMs;
  const depIso = depMs ? new Date(depMs).toISOString() : item.start_datetime || '';
  const depTime = timeIn(depIso, depTz);
  const depAbbr = abbrIn(depIso, depTz);

  const list = [];
  const status = text(flight?.status).toLowerCase();

  // 1. Status — the single most time-critical fact.
  if (status.includes('cancel')) {
    list.push({
      id: 'status',
      icon: 'status',
      text: airline
        ? t('home.brief.flightCancelledAirline', { airline })
        : t('home.brief.flightCancelled'),
    });
  } else {
    const delayMin = (schedMs && revised) ? Math.round((revised.getTime() - schedMs) / 60000) : 0;
    if (delayMin >= 5) {
      list.push({
        id: 'status',
        icon: 'status',
        text: t('home.brief.flightDelayed', { minutes: delayMin, time: depTime, abbr: depAbbr }),
      });
    } else if (gate) {
      list.push({
        id: 'status',
        icon: 'status',
        text: t('home.brief.flightOnTimeGate', {
          time: depTime, abbr: depAbbr, terminal: terminal || '—', gate,
        }),
      });
    } else if (depTime) {
      list.push({
        id: 'status',
        icon: 'status',
        text: t('home.brief.flightScheduled', {
          time: depTime, abbr: depAbbr, terminal: terminal || '',
        }),
      });
    }
  }

  // 2. Ground plan — real distance + traffic ETA, and the minute to leave by.
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);
  const hasTraffic = !!num(live?.route?.durationInTrafficSeconds);
  if (trafficSec && depMs) {
    const leaveMs = depMs - trafficSec * 1000 - AIRPORT_BUFFER_MIN * 60000;
    const leaveIso = new Date(leaveMs).toISOString();
    const distance = distLabel(meters, unit);
    const key = !distance
      ? 'home.brief.flightLeaveBare'
      : (hasTraffic ? 'home.brief.flightLeave' : 'home.brief.flightLeaveNoTraffic');
    list.push({
      id: 'ground',
      icon: 'ground',
      text: t(key, {
        origin: originLabel, leaveBy: timeIn(leaveIso, depTz), abbr: abbrIn(leaveIso, depTz),
        duration: durLabel(trafficSec, t), distance,
      }),
    });
  } else {
    const approx = haversineMeters(live?.origin?.point, live?.destination?.point);
    if (approx !== null) {
      list.push({
        id: 'ground',
        icon: 'ground',
        text: t('home.brief.flightLeaveApprox', {
          origin: originLabel, distance: distLabel(approx, unit),
        }),
      });
    } else if (depMs && airport) {
      const cutoffIso = new Date(depMs - AIRPORT_BUFFER_MIN * 60000).toISOString();
      list.push({
        id: 'ground',
        icon: 'ground',
        text: t('home.brief.flightBeThere', {
          airport, cutoff: timeIn(cutoffIso, depTz), abbr: abbrIn(cutoffIso, depTz),
        }),
      });
    }
  }

  // 3. Weather at the hour of arrival.
  const weather = weatherBullet({
    weather: live?.weather,
    city: text(live?.destination?.label) || text(item.to_place?.city),
    iso: item.end_datetime || depIso,
    tz: arrTz,
    unit,
    t,
  });
  if (weather) list.push(weather);

  // 4. Lounge tied to the airline and the live terminal.
  if (live?.lounge?.name) {
    list.push({
      id: 'lounge',
      icon: 'lounge',
      text: live.lounge.terminal
        ? t('home.brief.flightLounge', {
          lounge: live.lounge.name, terminal: live.lounge.terminal, airline: airline || '',
        })
        : t('home.brief.flightLoungeNoTerminal', { lounge: live.lounge.name, airline: airline || '' }),
    });
  }

  // 5. How fresh the status feed is.
  const feed = freshnessBullet(flight, t, now);
  if (feed) list.push(feed);

  const extras = [];
  if (depMs) {
    const closeIso = new Date(depMs - CHECKIN_CLOSE_MIN * 60000).toISOString();
    extras.push({
      id: 'cutoff',
      icon: 'cutoff',
      text: t('home.brief.flightCheckIn', {
        time: timeIn(closeIso, depTz), abbr: abbrIn(closeIso, depTz), airline: airline || airport,
      }),
    });
  }
  if (terminal && !gate) {
    extras.push({
      id: 'terminal',
      icon: 'status',
      text: t('home.brief.flightTerminal', { terminal, airport }),
    });
  }
  return fillToThree(list, extras).slice(0, 5);
}

function transferBullets({ item, live, unit, t }) {
  const tz = text(item.from_place?.tz) || text(live?.origin?.tz);
  const destTz = text(item.to_place?.tz) || text(live?.destination?.tz);
  const from = text(live?.origin?.label) || text(item.from_place?.city) || text(item.location_from);
  const to = text(live?.destination?.label) || text(item.to_place?.city) || text(item.location_to);
  const startMs = item.start_datetime ? new Date(item.start_datetime).getTime() : null;
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);
  const hasTraffic = !!num(live?.route?.durationInTrafficSeconds);

  const list = [];
  if (trafficSec && startMs) {
    const leaveMs = startMs - trafficSec * 1000;
    const leaveIso = new Date(leaveMs).toISOString();
    const distance = distLabel(meters, unit);
    const key = !distance
      ? 'home.brief.transferTimingBare'
      : (hasTraffic ? 'home.brief.transferTiming' : 'home.brief.transferTimingNoTraffic');
    list.push({
      id: 'timing',
      icon: 'timing',
      text: t(key, {
        from, leaveBy: timeIn(leaveIso, tz), abbr: abbrIn(leaveIso, tz),
        duration: durLabel(trafficSec, t), distance,
      }),
    });
  } else {
    // Without the live payload the segment's own endpoints still give a real
    // straight-line distance, so the bullet never degrades to advice.
    const approx = haversineMeters(
      live?.origin?.point || item.from_place,
      live?.destination?.point || item.to_place || item.place,
    );
    list.push({
      id: 'timing',
      icon: 'timing',
      text: approx !== null
        ? t('home.brief.transferTimingApprox', { from, distance: distLabel(approx, unit) })
        : t('home.brief.transferDepart', {
          from, to, time: timeIn(item.start_datetime, tz), abbr: abbrIn(item.start_datetime, tz),
        }),
    });
  }

  if (item.end_datetime && to) {
    list.push({
      id: 'arrive',
      icon: 'arrive',
      text: t('home.brief.transferArrive', {
        to,
        time: timeIn(item.end_datetime, destTz || tz),
        abbr: abbrIn(item.end_datetime, destTz || tz),
      }),
    });
  }

  const weather = weatherBullet({
    weather: live?.weather,
    city: text(live?.destination?.label) || text(item.to_place?.city) || to,
    iso: item.end_datetime || item.start_datetime,
    tz: destTz,
    unit,
    t,
  });
  if (weather) list.push(weather);

  // Filler only when a live source is missing: the departure clock time is still
  // a concrete number, never advice.
  const extras = [];
  if (item.start_datetime && from) {
    extras.push({
      id: 'depart',
      icon: 'timing',
      text: t('home.brief.transferStart', {
        from, time: timeIn(item.start_datetime, tz), abbr: abbrIn(item.start_datetime, tz),
      }),
    });
  }
  return fillToThree(list, extras).slice(0, 5);
}

function stayBullets({ item, live, unit, t }) {
  const startTz = text(item.place?.tz) || text(item.to_place?.tz);
  const startIso = item.start_datetime || '';
  const startMs = startIso ? new Date(startIso).getTime() : null;
  const originLabel = text(live?.origin?.label) || '';
  const place = text(live?.destination?.label) || text(item.place?.city)
    || text(item.place?.name) || text(item.location_name);
  const code = text(item.confirmation_number);
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);

  const list = [];
  if (trafficSec && startMs && originLabel) {
    const leaveMs = startMs - trafficSec * 1000 - 15 * 60000;
    const leaveIso = new Date(leaveMs).toISOString();
    const distance = distLabel(meters, unit);
    list.push({
      id: 'travel',
      icon: 'timing',
      text: t(distance ? 'home.brief.stayTravel' : 'home.brief.stayTravelBare', {
        origin: originLabel, duration: durLabel(trafficSec, t), distance,
        leaveBy: timeIn(leaveIso, startTz), abbr: abbrIn(leaveIso, startTz),
      }),
    });
  } else {
    const approx = haversineMeters(live?.origin?.point, live?.destination?.point);
    if (approx !== null && originLabel) {
      list.push({
        id: 'travel',
        icon: 'timing',
        text: t('home.brief.stayTravelApprox', {
          origin: originLabel, distance: distLabel(approx, unit),
        }),
      });
    } else if (startMs) {
      // No origin at all: still give a concrete clock time to aim for.
      const arriveIso = new Date(startMs - 15 * 60000).toISOString();
      list.push({
        id: 'arriveBy',
        icon: 'timing',
        text: t('home.brief.stayArriveBy', {
          time: timeIn(arriveIso, startTz), abbr: abbrIn(arriveIso, startTz),
        }),
      });
    }
  }

  if (item.type === 'hotel') {
    list.push({
      id: 'checkin',
      icon: 'checkin',
      text: code
        ? t('home.brief.stayCheckIn', { time: timeIn(startIso, startTz), abbr: abbrIn(startIso, startTz), code })
        : t('home.brief.stayCheckInNoCode', { time: timeIn(startIso, startTz), abbr: abbrIn(startIso, startTz) }),
    });
  } else if (startIso) {
    list.push({
      id: 'start',
      icon: 'checkin',
      text: t('home.brief.stayStart', {
        time: timeIn(startIso, startTz), abbr: abbrIn(startIso, startTz), place,
      }),
    });
  }

  const weather = weatherBullet({
    weather: live?.weather,
    city: place,
    iso: startIso,
    tz: startTz,
    unit,
    t,
  });
  if (weather) list.push(weather);

  const extras = [];
  if (item.type === 'hotel' && item.end_datetime) {
    extras.push({
      id: 'checkout',
      icon: 'checkin',
      text: t('home.brief.stayCheckOut', {
        time: timeIn(item.end_datetime, startTz), abbr: abbrIn(item.end_datetime, startTz),
      }),
    });
  }
  if (code) {
    extras.push({
      id: 'confirm',
      icon: 'hint',
      text: t('home.brief.stayConfirmation', { code }),
    });
  }
  if (live && live.origin && live.origin.source === 'none') {
    extras.push({ id: 'noOrigin', icon: 'hint', text: t('home.brief.noOrigin') });
  }
  return fillToThree(list, extras).slice(0, 5);
}

export function buildBriefBullets({ item, live = null, unit = 'mi', t, now = new Date() }) {
  if (!item || typeof t !== 'function') return [];
  const family = briefFamily(item.type);
  if (family === FLIGHT) return flightBullets({ item, live, unit, t, now });
  if (family === TRANSFER) return transferBullets({ item, live, unit, t });
  return stayBullets({ item, live, unit, t });
}