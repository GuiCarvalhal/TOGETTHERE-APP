// Pure helpers for the per-day distance & duration summary. No React, no API
// calls — fed to useJourneyDayTotals (fetch) and the unit tests (fixtures).
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

// Fold fetched route results into per-day totals. `results` is the array from
// getJourneyLegRoutes, aligned to the FETCHABLE legs (both endpoints present,
// not samePlace) in order. null => the call failed (every fetchable leg is
// unknown). A missing-endpoint leg is unknown (not zero); a samePlace leg is a
// known zero. Returns { [dayKey]: { state, distanceMeters, durationSeconds,
// legs } } where state is 'none' | 'unavailable' | 'partial' | 'ready'.
export function computeDayTotals(legs, results) {
  const byDay = {};
  let ri = 0;
  (legs || []).forEach((l) => {
    if (!byDay[l.dayKey]) byDay[l.dayKey] = { distanceMeters: 0, durationSeconds: 0, attempted: 0, ok: 0, unknown: 0 };
    const d = byDay[l.dayKey];
    if (!l.origin || !l.destination) { d.attempted++; d.unknown++; return; }
    if (l.samePlace) { d.attempted++; d.ok++; return; }
    d.attempted++;
    if (results) {
      const r = results[ri]; ri++;
      if (r && r.ok && typeof r.distanceMeters === 'number' && typeof r.durationSeconds === 'number') {
        d.distanceMeters += r.distanceMeters;
        d.durationSeconds += r.durationSeconds;
        d.ok++;
      } else {
        d.unknown++;
      }
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

// --- Locale-aware formatters for the summary line ---
export function formatDistanceMeters(meters, locale) {
  if (meters == null || !isFinite(meters)) return '';
  if (locale === 'en') {
    const miles = meters / 1609.344;
    return miles < 10 ? `${miles.toFixed(1)} mi` : `${Math.round(miles)} mi`;
  }
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatDurationSeconds(seconds) {
  if (seconds == null || !isFinite(seconds)) return '';
  const m = Math.round(seconds / 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return min > 0 ? `${h}h ${min}m` : `${h}h`;
  return `${min} min`;
}