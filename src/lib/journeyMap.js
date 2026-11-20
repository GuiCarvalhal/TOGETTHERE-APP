// Shared helpers for the journey route map: coordinate detection, waypoint
// extraction, and per-item participant resolution. Pure functions, no React —
// used by both JourneyRouteMap (rendering) and JourneyMapPanel (counting).

export function hasCoord(p) {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number'
    && isFinite(p.lat) && isFinite(p.lng);
}

// The single source of truth for which stored place object(s) a journey item
// maps to. Both the item detail page (SegmentMap) and the route map consume
// this so the two can never read different fields for the same record.
export function itemMapPoints(item) {
  const isRoute = ['flight', 'car', 'train', 'cruise'].includes(item?.type);
  return {
    origin: isRoute ? item?.from_place : null,
    destination: isRoute ? item?.to_place : null,
    point: !isRoute ? item?.place : null,
  };
}

// ── Endpoint identity ───────────────────────────────────────────────────────
// A corridor is only as identifiable as its two endpoints, so a waypoint keeps
// EVERY identity the stored place already carries: coordinates, IATA code, city
// + country, and a normalized name. This used to stop at {lat,lng,name}, which
// threw the semantic identity away before a leg was even built and left the
// corridor matcher with nothing but raw numbers to compare.
const normText = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const normIata = (s) => {
  const v = String(s || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : '';
};

const normCountry = (s) => String(s || '').trim().toUpperCase();

function waypoint(point, fallbackName) {
  return {
    lat: point.lat,
    lng: point.lng,
    name: point.name || fallbackName || '',
    iata: normIata(point.iata),
    city: point.city || '',
    country: normCountry(point.country || point.country_alpha3),
  };
}

// Ordered list of waypoints for an item:
//  - route items (flight/car/train/cruise) with both from_place & to_place:
//    origin then destination (two stops)
//  - point items (hotel/activity) with place: a single stop
//  - a route item with only one resolved end: a single stop
// Empty array when the item has no usable coordinates (not mappable).
export function itemWaypoints(item) {
  const { origin: o, destination: d, point: p } = itemMapPoints(item);
  if (hasCoord(o) && hasCoord(d)) {
    return [
      waypoint(o, item.location_from || 'Origin'),
      waypoint(d, item.location_to || 'Destination'),
    ];
  }
  if (hasCoord(p)) return [waypoint(p, item.location_name || 'Stop')];
  if (hasCoord(o)) return [waypoint(o, item.location_from || 'Origin')];
  if (hasCoord(d)) return [waypoint(d, item.location_to || 'Destination')];
  return [];
}

// The legs the route map draws, one per consecutive PAIR of waypoints, in
// chronological order. Two kinds:
//  - 'flight': a flight's own origin → destination. Always a straight
//    point-to-point line (the great-circle geodesic), never a road.
//  - 'drive' : every other pair — a transfer between two segments, or the
//    ground leg of a car/train/cruise. These follow the real driving route
//    Google returns for the same two endpoints (the same request that measures
//    the leg), with the straight line as the fallback while it loads, when it
//    is unavailable, or offline.
// The key is the routable pair itself, so identical legs are requested once and
// an unchanged leg is never re-measured.
//
// ── Flown-corridor equivalence ──────────────────────────────────────────────
// A ground leg must never be drawn over a corridor that is already flown, and
// its cached road geometry must never be decoded.
//
// Why the previous attempts failed: records describing the SAME corridor do not
// agree on coordinates. One side stores airport points, the other a city
// centroid, another a duplicate booking resolved to a slightly different place.
// An exact `origin|destination` string match misses all of them, and a SINGLE
// fixed degree tolerance cannot work either — it must be wide enough for
// metro-scale drift (New York centroid → JFK is ~19 km, London → LHR ~23 km) yet
// narrow enough not to swallow a genuine airport ↔ hotel transfer in the same
// city. No single number satisfies both.
//
// So equivalence is decided in LAYERS, strongest identity first, and only then
// by geography with a tolerance scaled to the corridor's own length:
//
//   1. IATA code — an airport code IS the place. Two different codes are a hard
//      NO (strong disagreement), so a JFK ↔ EWR ground transfer can never be
//      mistaken for a JFK ↔ LHR flight.
//   2. City + country — the airport-vs-city drift that coordinates cannot
//      absorb, bounded to metro scale (SEMANTIC_CITY_MAX_KM) so two same-named
//      cities far apart never match.
//   3. Normalized place name — only an exact match counts.
//   4. Geography — the distance between the two endpoints must fit a tolerance
//      that grows with the corridor: a short hop gets a tight 10 km, a long-haul
//      gets up to 60 km (enough for any metro's airport drift), never more.
//
// Anything weaker than that fails CLOSED: an unknown endpoint never suppresses a
// leg, so a legitimate transfer is never lost to a guess. Non-flight legs are
// untouched when nothing is flown.
export const CORRIDOR_TOLERANCE_KM = { min: 10, max: 60, factor: 0.02 };
export const SEMANTIC_CITY_MAX_KM = 100;

export function haversineKm(a, b) {
  if (!hasCoord(a) || !hasCoord(b)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Adaptive geo tolerance for a corridor of `corridorKm`: short corridors stay
// tight, long-haul corridors widen just enough to absorb airport-vs-city drift.
export function corridorToleranceKm(corridorKm) {
  const km = Number.isFinite(corridorKm) ? Math.abs(corridorKm) : 0;
  const { min, max, factor } = CORRIDOR_TOLERANCE_KM;
  return Math.min(max, Math.max(min, km * factor));
}

// Do two leg endpoints identify the same place?
// Returns { matched, by, distanceKm } — `by` names the deciding layer:
// 'iata' | 'city' | 'text' | 'geo' | 'iata_conflict' | 'none'.
export function endpointMatch(a, b, { toleranceKm = CORRIDOR_TOLERANCE_KM.min } = {}) {
  if (!a || !b) return { matched: false, by: 'none', distanceKm: null };
  const distanceKm = haversineKm(a, b);
  // 1. Strong semantic identity. Two different airport codes are a hard no.
  if (a.iata && b.iata) {
    return a.iata === b.iata
      ? { matched: true, by: 'iata', distanceKm }
      : { matched: false, by: 'iata_conflict', distanceKm };
  }
  // 2. Same city and country (metro-scale only — same-named cities far apart
  //    must never match).
  if (a.city && b.city && a.country && b.country
    && normText(a.city) === normText(b.city) && a.country === b.country
    && (distanceKm == null || distanceKm <= SEMANTIC_CITY_MAX_KM)) {
    return { matched: true, by: 'city', distanceKm };
  }
  // 3. Exact normalized place name.
  if (a.name && b.name && normText(a.name) === normText(b.name)) {
    return { matched: true, by: 'text', distanceKm };
  }
  // 4. Geography, with the corridor's adaptive tolerance.
  if (distanceKm != null) {
    return distanceKm <= toleranceKm
      ? { matched: true, by: 'geo', distanceKm }
      : { matched: false, by: 'none', distanceKm };
  }
  // 5. Weak data: fail closed — never suppress on a guess.
  return { matched: false, by: 'none', distanceKm: null };
}

// Undirected corridor equivalence: the drive leg may run the same corridor in
// either direction. Both endpoints must match, always.
export function isEquivalentCorridor(flightLeg, driveLeg, { toleranceKm } = {}) {
  if (!flightLeg || !driveLeg) return false;
  if (flightLeg.kind !== 'flight' || driveLeg.kind !== 'drive') return false;
  const opts = { toleranceKm: toleranceKm ?? corridorToleranceKm(haversineKm(flightLeg.from, flightLeg.to)) };
  const forward = endpointMatch(driveLeg.from, flightLeg.from, opts).matched
    && endpointMatch(driveLeg.to, flightLeg.to, opts).matched;
  if (forward) return true;
  return endpointMatch(driveLeg.from, flightLeg.to, opts).matched
    && endpointMatch(driveLeg.to, flightLeg.from, opts).matched;
}

// Debug/diagnostic companion to isEquivalentCorridor: WHY a drive leg did or did
// not match a flown corridor. Pure and side-effect free — used by tests (and
// available for future diagnostics), never rendered.
export function explainCorridorMatch(flightLegs, driveLeg, { toleranceKm } = {}) {
  const attempts = [];
  (flightLegs || []).forEach((f, flightIndex) => {
    if (!f || f.kind !== 'flight') return;
    const corridorKm = haversineKm(f.from, f.to);
    const tol = toleranceKm ?? corridorToleranceKm(corridorKm);
    const opts = { toleranceKm: tol };
    const directions = [
      ['forward', [[driveLeg?.from, f.from], [driveLeg?.to, f.to]]],
      ['reverse', [[driveLeg?.from, f.to], [driveLeg?.to, f.from]]],
    ];
    directions.forEach(([direction, pairs]) => {
      const endpoints = pairs.map(([a, b], i) => ({
        role: i === 0 ? 'from' : 'to',
        ...endpointMatch(a, b, opts),
      }));
      const hits = endpoints.filter((e) => e.matched).length;
      const matched = hits === endpoints.length;
      attempts.push({
        matched,
        flightIndex,
        direction,
        corridorKm,
        toleranceKm: tol,
        hits,
        endpoints,
        reason: !matched
          ? 'no_match'
          : endpoints.every((e) => e.by === 'iata')
            ? 'semantic_iata'
            : endpoints.every((e) => e.by === 'city' || e.by === 'iata')
              ? 'semantic_city'
              : endpoints.every((e) => e.by === 'text')
                ? 'semantic_text'
                : 'geo',
      });
    });
  });
  const hit = attempts.find((a) => a.matched);
  if (hit) return hit;
  const best = attempts.slice().sort((x, y) => y.hits - x.hits)[0];
  return best || {
    matched: false, flightIndex: null, direction: null, corridorKm: null,
    toleranceKm: null, hits: 0, endpoints: [], reason: 'no_flights',
  };
}

export function mapRouteLegs(items, { toleranceKm } = {}) {
  const sorted = [...(items || [])].sort(
    (a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0)
  );
  const legs = [];
  let previous = null; // { point, itemId } — the arrival point of the last mapped item
  sorted.forEach((it) => {
    const wps = itemWaypoints(it);
    if (wps.length === 0) return;
    if (wps.length > 1) {
      legs.push(makeMapLeg(wps[0], wps[wps.length - 1], it.type === 'flight' ? 'flight' : 'drive', it.id, it.id));
    }
    if (previous) legs.push(makeMapLeg(previous.point, wps[0], 'drive', previous.itemId, it.id));
    previous = { point: wps[wps.length - 1], itemId: it.id };
  });
  const built = legs.filter(Boolean);
  // A flown corridor is drawn as ONE straight line. Any ground leg that is
  // EQUIVALENT to that corridor (same two places, either direction, decided by
  // the layered matcher above) would trace a road over that straight line, so
  // the flight wins and the ground leg is dropped HERE — before any road
  // geometry is requested, cached or decoded. Derived from the legs themselves,
  // so a refresh can never bring it back. Non-flight legs are otherwise
  // untouched.
  const flown = built.filter((l) => l.kind === 'flight');
  if (flown.length === 0) return built;
  return built.filter((l) => l.kind === 'flight'
    || !flown.some((f) => isEquivalentCorridor(f, l, { toleranceKm })));
}

// One leg endpoint: the routable string (unchanged — the route cache is keyed by
// it) plus the full identity the matcher needs.
const endpointOf = (w) => ({
  lat: w.lat,
  lng: w.lng,
  name: w.name || '',
  iata: normIata(w.iata),
  city: w.city || '',
  country: normCountry(w.country),
});

function makeMapLeg(from, to, kind, fromItemId, toItemId) {
  if (!from || !to) return null;
  const sameLat = Math.abs(from.lat - to.lat) < 1e-6;
  const sameLng = Math.abs(from.lng - to.lng) < 1e-6;
  if (sameLat && sameLng) return null; // no travel between two identical points
  const origin = `${from.lat},${from.lng}`;
  const destination = `${to.lat},${to.lng}`;
  return {
    key: `${origin}|${destination}`,
    origin,
    destination,
    from: endpointOf(from),
    to: endpointOf(to),
    kind,
    fromItemId,
    toItemId,
  };
}

// The user ids that "belong to" an item for per-person route coloring: the
// opt-in attendee_user_ids, or — when no one opted in — the item creator.
// Same rule as the journey list's participant resolver (attendees, never the
// ACL member_user_ids of all gathering members).
export function itemParticipantIds(item) {
  if ((item?.attendee_user_ids || []).length) return item.attendee_user_ids;
  return item?.owner_id ? [item.owner_id] : [];
}

// Single source of truth for the route numbering shared by the route map
// (pin labels) and the journey cards (left-column reference marker). Returns a
// Map<itemId, number> where number is the 1-based chronological index of the
// item's FIRST mapped waypoint; items with no mapped waypoint are absent
// (→ no number on the card, no pin on the map). Both consumers MUST use this
// so the card marker and the pin label can never drift.
export function itemRouteNumbers(items) {
  const sorted = [...items].sort(
    (a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0)
  );
  const numbers = new Map();
  let n = 0;
  sorted.forEach((it) => {
    const wps = itemWaypoints(it);
    if (wps.length === 0) return;
    n += 1; // first waypoint of this item takes the next number
    numbers.set(it.id, n);
    n += wps.length - 1; // advance past the item's remaining waypoints
  });
  return numbers;
}

// A single human label for an item's location (origin → destination, or place).
export function placeLabel(item) {
  const o = item?.from_place, d = item?.to_place, p = item?.place;
  if (o?.name && d?.name) return `${o.name} → ${d.name}`;
  if (o?.name) return o.name;
  if (d?.name) return d.name;
  if (p?.name) return p.name;
  return item?.location_name || item?.location_to || item?.location_from || item?.title || '';
}

// Stable cache key for a suggestion marker/card, so the map pin and the card
// rail marker read the SAME number for the SAME suggestion. A suggestion is
// identified by its category label + place (name + address): the same place can
// appear under two categories, so categoryLabel disambiguates. Used by both
// suggestionRouteNumbers (below) and the Agent page's card lookup.
export const suggestionKey = (s) =>
  `${s?.categoryLabel || ''}::${s?.place?.name || ''}::${s?.place?.address || ''}`;

// Single source of truth for suggestion pin numbers, shared by the Agent route
// map (pin labels) and the Agent place cards (left-rail reference marker).
// Returns a Map<suggestionKey, number> where number is the 1-based index of the
// suggestion among those that have resolved coordinates, in the order the
// caller passes them in (page order: Today, Eat, Do). Suggestions without
// coords are absent (→ no number on the card, no pin). Both consumers MUST use
// this (and the same resolved list) so a card marker and its pin can never drift.
export function suggestionRouteNumbers(suggestions) {
  const numbers = new Map();
  let n = 0;
  (suggestions || []).forEach((s) => {
    if (s.lat == null || s.lng == null) return;
    n += 1;
    numbers.set(suggestionKey(s), n);
  });
  return numbers;
}