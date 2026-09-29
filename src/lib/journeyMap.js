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

// Ordered list of { lat, lng, name } waypoints for an item:
//  - route items (flight/car/train/cruise) with both from_place & to_place:
//    origin then destination (two stops)
//  - point items (hotel/activity) with place: a single stop
//  - a route item with only one resolved end: a single stop
// Empty array when the item has no usable coordinates (not mappable).
export function itemWaypoints(item) {
  const { origin: o, destination: d, point: p } = itemMapPoints(item);
  if (hasCoord(o) && hasCoord(d)) {
    return [
      { lat: o.lat, lng: o.lng, name: o.name || item.location_from || 'Origin' },
      { lat: d.lat, lng: d.lng, name: d.name || item.location_to || 'Destination' },
    ];
  }
  if (hasCoord(p)) return [{ lat: p.lat, lng: p.lng, name: p.name || item.location_name || 'Stop' }];
  if (hasCoord(o)) return [{ lat: o.lat, lng: o.lng, name: o.name || item.location_from || 'Origin' }];
  if (hasCoord(d)) return [{ lat: d.lat, lng: d.lng, name: d.name || item.location_to || 'Destination' }];
  return [];
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