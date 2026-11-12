// Pure helpers for the per-day distance & duration summary. No React, no API
// calls — fed to useJourneyLegDistances (fetch) and the unit tests (fixtures).
// Reuses the same place/coordinate shape as journeyMap.js (from_place /
// to_place / place with lat,lng) so the legs read the same stored data the
// route map and cards already use.

export const ROUTE_TYPES = ['flight', 'car', 'train', 'cruise'];

// Where a segment ENDS (its arrival point) — used as the ORIGIN of the next
// inter-segment leg. Route items (flight/car/train/cruise) arrive at their
// destination; point items (hotel/activity/other/main_event) arrive at their
// place. A flight's arrival point is its destination airport, so the ground
// transfer FROM it is a real drive — the flight itself is never a ground leg.
export function arrivalPoint(item) {
  if (!item) return null;
  if (ROUTE_TYPES.includes(item.type)) return item.to_place || null;
  return item.place || null;
}

// Where a segment STARTS (its departure point) — used as the DESTINATION of
// the previous inter-segment leg. Route items depart from their origin; point
// items depart from their place.
export function departurePoint(item) {
  if (!item) return null;
  if (ROUTE_TYPES.includes(item.type)) return item.from_place || null;
  return item.place || null;
}

// A string Google Directions can route on: "lat,lng" when coords are present
// (most accurate), else the place address/name, else a free-text fallback.
// Empty string when nothing usable exists — the caller treats an empty
// endpoint as an UNKNOWN leg (never as a zero-distance leg).
export function pointToString(point, fallback) {
  if (!point) return fallback || '';
  if (typeof point.lat === 'number' && typeof point.lng === 'number'
      && isFinite(point.lat) && isFinite(point.lng)) {
    return `${point.lat},${point.lng}`;
  }
  return point.address || point.name || fallback || '';
}

export function arrivalString(item) {
  const s = pointToString(arrivalPoint(item), '');
  if (s) return s;
  if (ROUTE_TYPES.includes(item.type)) return item.location_to || '';
  return item.location_name || item.location_to || item.location_from || '';
}

export function departureString(item) {
  const s = pointToString(departurePoint(item), '');
  if (s) return s;
  if (ROUTE_TYPES.includes(item.type)) return item.location_from || '';
  return item.location_name || item.location_from || item.location_to || '';
}

// Build the inter-segment driving legs for the timeline entries, grouped by
// dayKey. Each leg runs from the previous entry's arrival point to the next
// entry's departure point, within the same day. Legs with a missing endpoint
// are kept (so the day can be marked incomplete); same-origin/destination legs
// are flagged so the fetcher skips them and the totals treat them as a known
// zero rather than an unknown.
// Stable key for ONE inter-segment leg: dayKey + the index of the leg's ORIGIN
// entry inside that day (0 = the leg between entry 0 and entry 1). The timeline
// renders a row per leg, so the key is how a resolved leg finds its row.
export function legKey(dayKey, idx) {
  return `${dayKey}:${idx}`;
}

export function buildDayLegs(entries) {
  const byDay = {};
  (entries || []).forEach((e) => {
    const dk = e.dayKey;
    if (!dk) return;
    if (!byDay[dk]) byDay[dk] = [];
    byDay[dk].push(e);
  });
  const legs = [];
  Object.keys(byDay).forEach((dk) => {
    const dayEntries = byDay[dk];
    if (dayEntries.length < 2) return;
    for (let i = 0; i < dayEntries.length - 1; i++) {
      const prev = dayEntries[i].item;
      const next = dayEntries[i + 1].item;
      const origin = arrivalString(prev);
      const destination = departureString(next);
      const samePlace = !!origin && !!destination && origin === destination;
      legs.push({ dayKey: dk, idx: i, origin, destination, samePlace });
    }
  });
  return legs;
}

// Per-LEG travel state, keyed by legKey(dayKey, idx). This is what the timeline
// renders between two consecutive cards: the real displacement from one segment
// to the next (not a day aggregate).
// state: 'ok'      → routed (distanceMeters + durationSeconds present)
//        'same'    → both endpoints are the same place: a known zero
//        'unknown' → a missing endpoint, or the route could not be resolved
// origin/destination are the exact routable strings the distance was measured
// on (lat,lng when coordinates exist, else address/name), so the row's Google
// Maps deep link targets the same two points.
export function computeLegStates(legs, results) {
  const out = {};
  let ri = 0;
  (legs || []).forEach((l) => {
    const k = legKey(l.dayKey, l.idx);
    const base = { origin: l.origin, destination: l.destination };
    if (!l.origin || !l.destination) { out[k] = { ...base, state: 'unknown' }; return; }
    if (l.samePlace) { out[k] = { ...base, state: 'same', distanceMeters: 0, durationSeconds: 0 }; return; }
    if (!results) { out[k] = { ...base, state: 'unknown' }; return; }
    const r = results[ri]; ri++;
    if (r && r.ok && typeof r.distanceMeters === 'number' && typeof r.durationSeconds === 'number') {
      out[k] = { ...base, state: 'ok', distanceMeters: r.distanceMeters, durationSeconds: r.durationSeconds };
    } else {
      out[k] = { ...base, state: 'unknown' };
    }
  });
  return out;
}

// Fold fetched route results into per-day totals. `results` is the array from
// getJourneyLegRoutes, aligned to the FETCHABLE legs (both endpoints present,
// not samePlace) in order. null => the call failed (every fetchable leg is
// unknown). A missing-endpoint leg is unknown (not zero); a samePlace leg is a
// known zero. Returns { [dayKey]: { state, distanceMeters, durationSeconds,
// legs } } where state is 'none' | 'unavailable' | 'partial' | 'ready'.
export function computeDayTotals(legs, results) {
  // Same per-leg resolution the timeline rows use — one source of truth.
  const states = computeLegStates(legs, results);
  const byDay = {};
  (legs || []).forEach((l) => {
    if (!byDay[l.dayKey]) byDay[l.dayKey] = { distanceMeters: 0, durationSeconds: 0, attempted: 0, ok: 0, unknown: 0 };
    const d = byDay[l.dayKey];
    const s = states[legKey(l.dayKey, l.idx)];
    d.attempted++;
    if (s && s.state === 'ok') {
      d.distanceMeters += s.distanceMeters;
      d.durationSeconds += s.durationSeconds;
      d.ok++;
    } else if (s && s.state === 'same') {
      d.ok++;
    } else {
      d.unknown++;
    }
  });
  const totals = {};
  Object.keys(byDay).forEach((dk) => {
    const d = byDay[dk];
    let state;
    if (d.attempted === 0) state = 'none';
    else if (d.ok === 0) state = 'unavailable';
    else if (d.unknown > 0) state = 'partial';
    else state = 'ready';
    totals[dk] = { state, distanceMeters: d.distanceMeters, durationSeconds: d.durationSeconds, legs: d.attempted };
  });
  return totals;
}

// --- Formatters for the travel rows ---
// `unit` is the user's distance preference ('mi' | 'km'). A locale string is
// still accepted for backwards compatibility ('pt*' → km, anything else → mi).
export function formatDistanceMeters(meters, unit = 'mi') {
  if (meters == null || !isFinite(meters)) return '';
  const metric = unit === 'km' || /^pt/i.test(String(unit));
  if (metric) {
    const km = meters / 1000;
    return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
  }
  const miles = meters / 1609.344;
  return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
}

export function formatDurationSeconds(seconds) {
  if (seconds == null || !isFinite(seconds)) return '';
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return min > 0 ? `${h}h ${min}m` : `${h}h`;
  return `${min} min`;
}