import { useResolvedCoords } from './useResolvedCoords';

// Runtime-only geocoding layer for journey items that lack native coordinates.
// Reuses the same shared engine (useResolvedCoords) as AI-suggested places —
// no third copy of the cache/dedupe/concurrency logic. READ-ONLY: it never
// writes, updates, creates or deletes a JourneyItem record; resolved coords
// live only in component state + localStorage for the session, then feed the
// SAME numbered pins and route polyline as natively-geocoded items.
//
// Why this exists: most legacy/beta journey items carry only free-text
// location strings (location_name, or location_from/location_to on routes),
// with no from_place/to_place/place coordinate objects. Without this layer the
// route map shows only the handful of items that were entered via autocomplete.

const STORAGE_PREFIX = 'tt-journey-coords::';
const ROUTE_TYPES = ['flight', 'car', 'train', 'cruise'];

// Build the geocoding query for one waypoint end. Route endpoints (origin /
// destination of a flight/car/train/cruise) are sent as-is — they're usually
// already qualified ("Dublin, IE") or well-known ("Naples Airport"), and
// appending the gathering destination would mis-geocode a flight whose origin
// is in another country. Point items (hotel/activity) benefit from the
// gathering's destination as context, but only for short bare names (no comma,
// <= 3 words) where ambiguity is likely; already-qualified strings are sent
// untouched.
function buildQuery(text, contextName, isPoint) {
  let q = (text || '').trim();
  if (!q) return '';
  if (isPoint && contextName) {
    const looksQualified = q.includes(',') || q.split(/\s+/).length > 3;
    if (!looksQualified) q = `${q}, ${contextName}`;
  }
  return q;
}

// Per-waypoint key: item id + end + raw text. Including the text means an edited
// location re-resolves (the key changes) instead of returning a stale cached
// coord, while the same text across scope toggles still hits the cache.
const wpKey = (q) => `${q.itemId}::${q.end}::${q.text}`;

// Hook: pass the journey items currently visible on the page (already scope-
// filtered) and the gathering's destination name for point-item context.
// Returns { coords, pending }. Pass the items only while the map panel is open
// (callers gate on mapOpen) so nothing resolves when collapsed.
export function useJourneyItemCoords(items, gatheringDestName) {
  const queries = [];
  (items || []).forEach((it) => {
    const isRoute = ROUTE_TYPES.includes(it.type);
    if (isRoute) {
      if (it.location_from && it.from_place?.lat == null) {
        queries.push({ itemId: it.id, end: 'origin', text: it.location_from });
      }
      if (it.location_to && it.to_place?.lat == null) {
        queries.push({ itemId: it.id, end: 'destination', text: it.location_to });
      }
    } else if (it.location_name && it.place?.lat == null) {
      queries.push({ itemId: it.id, end: 'place', text: it.location_name });
    }
  });
  return useResolvedCoords(queries, {
    keyFn: wpKey,
    queryFn: (q) => buildQuery(q.text, gatheringDestName, q.end === 'place'),
    storagePrefix: STORAGE_PREFIX,
  });
}

// Pure helper: merge resolved coords back into the item list as synthetic
// from_place/to_place/place objects (same shape itemWaypoints reads), so the
// existing map renders them as native numbered pins + polyline — preserving
// chronological order, numbering, and the mine/group scope behaviour. Items
// that already have native coords, or whose lookup hasn't resolved, pass
// through unchanged (the latter keep counting toward "N without a mapped
// location"). Never mutates the input array or records.
export function augmentItemsWithCoords(items, coords) {
  if (!coords || !Object.keys(coords).length) return items;
  return items.map((it) => {
    const isRoute = ROUTE_TYPES.includes(it.type);
    if (isRoute) {
      let next = it;
      if (it.location_from && it.from_place?.lat == null) {
        const o = coords[`${it.id}::origin::${it.location_from}`];
        if (o) next = { ...next, from_place: { lat: o.lat, lng: o.lng, name: it.location_from } };
      }
      if (it.location_to && it.to_place?.lat == null) {
        const d = coords[`${it.id}::destination::${it.location_to}`];
        if (d) next = { ...next, to_place: { lat: d.lat, lng: d.lng, name: it.location_to } };
      }
      return next;
    }
    if (it.location_name && it.place?.lat == null) {
      const p = coords[`${it.id}::place::${it.location_name}`];
      if (p) return { ...it, place: { lat: p.lat, lng: p.lng, name: it.location_name } };
    }
    return it;
  });
}

export default useJourneyItemCoords;