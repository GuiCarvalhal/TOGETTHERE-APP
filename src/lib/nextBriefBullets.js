import { formatTimeTz, formatTimeOnly, tzAbbrAt } from './formatPlaceTime';
import { formatDistanceMeters } from './journeyDistance';

// Builds Home's "Next / Now" bullets from the segment plus the LIVE payload
// returned by the getNextBrief function (flight status, traffic ETA, weather,
// lounge). Pure and deterministic.
//
// ADDITIVE-ONLY CONTRACT: the featured card directly above already prints the
// segment's title/route, its departure and arrival clock times, its duration and
// its meta line. No bullet here may restate any of that — every template emits
// NEW information only (live status, leave-by, traffic delta, timezone delta,
// weather, lounge, operational cutoffs, references). As a safety net,
// buildBriefBullets drops any bullet whose text still contains a clock time the
// card shows, and skips a duplicate outright instead of padding with filler.
//
// Returns [{ id, icon, text }] with `text` already translated (the component
// only renders it), prioritized by value and capped at 5.

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

// "1 h 30 min" from a minute count.
function minutesLabel(mins, t) {
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (!hours) return t('home.brief.min', { count: rest });
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

// Weather only — never the place or the hour, both of which the card prints.
function weatherBullet({ weather, unit, t, when }) {
  const temp = tempLabel(weather, unit);
  const kind = wmoKey(weather?.code);
  if (!temp || !kind) return null;
  return {
    id: 'weather',
    icon: 'weather',
    text: t(when === 'start' ? 'home.brief.weatherStart' : 'home.brief.weatherArrive', {
      temp, condition: t(`home.brief.wmo.${kind}`),
    }),
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

// ── "Already on the card" facts ───────────────────────────────────────────
// Every clock time the featured card prints, in every timezone the item may be
// rendered in (the card resolves the place tz; the builder does not have that
// hook, so all candidates are collected). A stay is featured on its CHECK-IN
// leg, so its check-out time is NOT on screen and stays available.
function clockStrings(item) {
  const tzs = [item.from_place?.tz, item.to_place?.tz, item.place?.tz].filter(Boolean);
  const out = new Set();
  const add = (iso) => {
    if (!iso) return;
    tzs.forEach((tz) => {
      const s = formatTimeOnly(iso, tz);
      if (s && s.length >= 6) out.add(s);
    });
  };
  add(item.start_datetime);
  if (item.type !== 'hotel') add(item.end_datetime);
  return [...out];
}

// ── Timezone context (a delta the card never shows) ───────────────────────
function tzOffsetMinutes(date, tz) {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  } catch { return null; }
}

function localTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
}

function tzBullet({ tz, t, now }) {
  const there = text(tz);
  if (!there) return null;
  const a = tzOffsetMinutes(now, there);
  const b = tzOffsetMinutes(now, localTz());
  if (a === null || b === null) return null;
  const delta = a - b;
  if (delta === 0) return null;
  return {
    id: 'tz',
    icon: 'tz',
    text: t(delta > 0 ? 'home.brief.tzAhead' : 'home.brief.tzBehind', {
      amount: minutesLabel(Math.abs(delta), t),
    }),
  };
}

// The same instant on the traveller's own clock — additive unless the card
// already prints that exact time (then the dedupe filter drops it).
function yourTimeBullet({ iso, t }) {
  if (!iso) return null;
  const tz = localTz();
  const time = tz ? formatTimeOnly(iso, tz) : '';
  if (!time) return null;
  return { id: 'yourtime', icon: 'tz', text: t('home.brief.yourTime', { time }) };
}

// How much worse the live ETA is than the free-flow duration: the "delta".
function trafficDelta(live, t) {
  const withTraffic = num(live?.route?.durationInTrafficSeconds);
  const free = num(live?.route?.durationSeconds);
  if (!withTraffic || !free) return '';
  const diff = Math.round((withTraffic - free) / 60);
  if (diff < 2) return '';
  return t('home.brief.trafficDelta', { minutes: diff });
}

// A booking reference the card does not print (flights show the flight number
// only; transfers and stays show their location).
function refBullet(item, t) {
  const ref = text(item.booking_reference) || text(item.confirmation_number);
  if (!ref) return null;
  return { id: 'ref', icon: 'hint', text: t('home.brief.stayConfirmation', { code: ref }) };
}

function flightBullets({ item, live, unit, t, now }) {
  const depTz = text(item.from_place?.tz) || text(live?.origin?.tz);
  const arrTz = text(item.to_place?.tz) || text(live?.destination?.tz);
  const flight = live?.flight || null;
  const dep = flight?.departure || null;
  const terminal = text(dep?.terminal);
  const gate = text(dep?.gate);
  const status = text(flight?.status).toLowerCase();

  const schedMs = providerInstant(dep?.scheduled)?.getTime()
    ?? (item.start_datetime ? new Date(item.start_datetime).getTime() : null);
  const revised = providerInstant(dep?.revised) || providerInstant(dep?.actual);
  const depMs = revised ? revised.getTime() : schedMs;
  const depIso = depMs ? new Date(depMs).toISOString() : item.start_datetime || '';
  const delta = trafficDelta(live, t);

  const primary = [];

  // 1. Live status — only facts the card cannot know. No clock time is repeated:
  // an unchanged departure is not news, a delayed one is (new time).
  if (status.includes('cancel')) {
    primary.push({ id: 'status', icon: 'status', text: t('home.brief.flightCancelled') });
  } else {
    const delayMin = (schedMs && revised) ? Math.round((revised.getTime() - schedMs) / 60000) : 0;
    if (delayMin >= 5) {
      primary.push({
        id: 'status',
        icon: 'status',
        text: t('home.brief.flightDelayed', {
          minutes: delayMin, time: timeIn(depIso, depTz), abbr: abbrIn(depIso, depTz),
        }),
      });
    } else if (gate) {
      primary.push({
        id: 'status',
        icon: 'status',
        text: t(terminal ? 'home.brief.flightOnTimeGate' : 'home.brief.flightGateNoTerminal', { gate, terminal }),
      });
    } else if (status) {
      primary.push({ id: 'status', icon: 'status', text: t('home.brief.flightScheduled') });
    }
  }

  // 2. Ground plan: the minute to leave by, from live traffic + airport buffer.
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);
  const hasTraffic = !!num(live?.route?.durationInTrafficSeconds);
  if (trafficSec && depMs) {
    const leaveIso = new Date(depMs - trafficSec * 1000 - AIRPORT_BUFFER_MIN * 60000).toISOString();
    const distance = distLabel(meters, unit);
    const key = !distance
      ? 'home.brief.flightLeaveBare'
      : (hasTraffic ? 'home.brief.flightLeave' : 'home.brief.flightLeaveNoTraffic');
    primary.push({
      id: 'ground',
      icon: 'ground',
      text: t(key, {
        leaveBy: timeIn(leaveIso, depTz), abbr: abbrIn(leaveIso, depTz),
        duration: durLabel(trafficSec, t), distance, delta,
      }),
    });
  } else {
    const approx = haversineMeters(live?.origin?.point, live?.destination?.point);
    if (approx !== null) {
      primary.push({
        id: 'ground',
        icon: 'ground',
        text: t('home.brief.flightLeaveApprox', { distance: distLabel(approx, unit) }),
      });
    } else if (depMs) {
      const cutoffIso = new Date(depMs - AIRPORT_BUFFER_MIN * 60000).toISOString();
      primary.push({
        id: 'ground',
        icon: 'ground',
        text: t('home.brief.flightBeThere', {
          cutoff: timeIn(cutoffIso, depTz), abbr: abbrIn(cutoffIso, depTz),
        }),
      });
    }
  }

  // 3. Timezone delta, then 4. weather, then 5. lounge / cutoffs / freshness.
  const tzB = tzBullet({ tz: arrTz, t, now });
  if (tzB) primary.push(tzB);

  const weather = weatherBullet({ weather: live?.weather, unit, t, when: 'arrive' });
  if (weather) primary.push(weather);

  if (live?.lounge?.name) {
    primary.push({
      id: 'lounge',
      icon: 'lounge',
      text: live.lounge.terminal
        ? t('home.brief.flightLounge', { lounge: live.lounge.name, terminal: live.lounge.terminal })
        : t('home.brief.flightLoungeNoTerminal', { lounge: live.lounge.name }),
    });
  }

  const extras = [];
  if (depMs) {
    const closeIso = new Date(depMs - CHECKIN_CLOSE_MIN * 60000).toISOString();
    extras.push({
      id: 'cutoff',
      icon: 'cutoff',
      text: t('home.brief.flightCheckIn', { time: timeIn(closeIso, depTz), abbr: abbrIn(closeIso, depTz) }),
    });
  }
  if (terminal && !gate) {
    extras.push({ id: 'terminal', icon: 'status', text: t('home.brief.flightTerminal', { terminal }) });
  }
  const feed = freshnessBullet(flight, t, now);
  if (feed) extras.push(feed);
  const yourTime = yourTimeBullet({ iso: item.end_datetime || depIso, t });
  if (yourTime) extras.push(yourTime);

  return { primary, extras };
}

function transferBullets({ item, live, unit, t, now }) {
  const tz = text(item.from_place?.tz) || text(live?.origin?.tz);
  const destTz = text(item.to_place?.tz) || text(live?.destination?.tz);
  const startMs = item.start_datetime ? new Date(item.start_datetime).getTime() : null;
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);
  const hasTraffic = !!num(live?.route?.durationInTrafficSeconds);
  const delta = trafficDelta(live, t);

  const primary = [];
  if (trafficSec && startMs) {
    const leaveIso = new Date(startMs - trafficSec * 1000).toISOString();
    const distance = distLabel(meters, unit);
    const key = !distance
      ? 'home.brief.transferTimingBare'
      : (hasTraffic ? 'home.brief.transferTiming' : 'home.brief.transferTimingNoTraffic');
    primary.push({
      id: 'timing',
      icon: 'timing',
      text: t(key, {
        leaveBy: timeIn(leaveIso, tz), abbr: abbrIn(leaveIso, tz),
        duration: durLabel(trafficSec, t), distance, delta,
      }),
    });
  } else {
    // Without the live payload the endpoints still give a real straight-line
    // distance — never a restatement of the route line itself.
    const approx = haversineMeters(
      live?.origin?.point || item.from_place,
      live?.destination?.point || item.to_place || item.place,
    );
    if (approx !== null) {
      primary.push({
        id: 'timing',
        icon: 'timing',
        text: t('home.brief.transferTimingApprox', { distance: distLabel(approx, unit) }),
      });
    }
  }

  const tzB = tzBullet({ tz: destTz || tz, t, now });
  if (tzB) primary.push(tzB);

  const weather = weatherBullet({ weather: live?.weather, unit, t, when: 'arrive' });
  if (weather) primary.push(weather);

  const extras = [];
  const yourTime = yourTimeBullet({ iso: item.end_datetime || item.start_datetime, t });
  if (yourTime) extras.push(yourTime);
  const ref = refBullet(item, t);
  if (ref) extras.push(ref);

  return { primary, extras };
}

function stayBullets({ item, live, unit, t, now }) {
  const startTz = text(item.place?.tz) || text(item.to_place?.tz);
  const startIso = item.start_datetime || '';
  const startMs = startIso ? new Date(startIso).getTime() : null;
  const originLabel = text(live?.origin?.label) || '';
  const trafficSec = num(live?.route?.durationInTrafficSeconds) ?? num(live?.route?.durationSeconds);
  const meters = num(live?.route?.distanceMeters);
  const delta = trafficDelta(live, t);

  const primary = [];
  if (trafficSec && startMs && originLabel) {
    const leaveIso = new Date(startMs - trafficSec * 1000 - 15 * 60000).toISOString();
    const distance = distLabel(meters, unit);
    primary.push({
      id: 'travel',
      icon: 'timing',
      text: t(distance ? 'home.brief.stayTravel' : 'home.brief.stayTravelBare', {
        origin: originLabel, duration: durLabel(trafficSec, t), distance, delta,
        leaveBy: timeIn(leaveIso, startTz), abbr: abbrIn(leaveIso, startTz),
      }),
    });
  } else {
    const approx = haversineMeters(live?.origin?.point, live?.destination?.point);
    if (approx !== null && originLabel) {
      primary.push({
        id: 'travel',
        icon: 'timing',
        text: t('home.brief.stayTravelApprox', { origin: originLabel, distance: distLabel(approx, unit) }),
      });
    } else if (startMs) {
      // The card already prints the start time; the 15-minutes-earlier target is
      // new information, so this stays additive.
      const arriveIso = new Date(startMs - 15 * 60000).toISOString();
      primary.push({
        id: 'arriveBy',
        icon: 'timing',
        text: t('home.brief.stayArriveBy', { time: timeIn(arriveIso, startTz), abbr: abbrIn(arriveIso, startTz) }),
      });
    }
  }

  const tzB = tzBullet({ tz: startTz, t, now });
  if (tzB) primary.push(tzB);

  const weather = weatherBullet({ weather: live?.weather, unit, t, when: 'start' });
  if (weather) primary.push(weather);

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
  const ref = refBullet(item, t);
  if (ref) extras.push(ref);
  const yourTime = yourTimeBullet({ iso: startIso, t });
  if (yourTime) extras.push(yourTime);
  if (live && live.origin && live.origin.source === 'none') {
    extras.push({ id: 'noOrigin', icon: 'hint', text: t('home.brief.noOrigin') });
  }

  return { primary, extras };
}

export function buildBriefBullets({ item, live = null, unit = 'mi', t, now = new Date() }) {
  if (!item || typeof t !== 'function') return [];
  const family = briefFamily(item.type);
  const { primary, extras } = family === FLIGHT
    ? flightBullets({ item, live, unit, t, now })
    : family === TRANSFER
      ? transferBullets({ item, live, unit, t, now })
      : stayBullets({ item, live, unit, t, now });

  // Additive-only enforcement: drop anything that still repeats a clock time the
  // featured card prints, and never pad a filtered bullet back in.
  const visible = clockStrings(item);
  const seen = new Set();
  const out = [];
  for (const b of [...primary, ...extras]) {
    if (!b || !b.text || seen.has(b.id)) continue;
    if (visible.some((v) => b.text.includes(v))) continue;
    seen.add(b.id);
    out.push(b);
    if (out.length === 5) break;
  }
  return out;
}