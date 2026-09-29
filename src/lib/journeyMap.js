// Shared helpers for the journey route map: coordinate detection, waypoint
// extraction, and per-item participant resolution. Pure functions, no React —
// used by both JourneyRouteMap (rendering) and JourneyMapPanel (counting).

export function hasCoord(p) {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number'
    && isFinite(p.lat) && isFinite(p.lng);
}

// Ordered list of { lat, lng, name } waypoints for an item:
//  - route items (flight/car/train/cruise) with both from_place & to_place:
//    origin then destination (two stops)
//  - point items (hotel/activity) with place: a single stop
//  - a route item with only one resolved end: a single stop
// Empty array when the item has no usable coordinates (not mappable).
export function itemWaypoints(item) {
  const o = item?.from_place, d = item?.to_place, p = item?.place;
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

// A single human label for an item's location (origin → destination, or place).
export function placeLabel(item) {
  const o = item?.from_place, d = item?.to_place, p = item?.place;
  if (o?.name && d?.name) return `${o.name} → ${d.name}`;
  if (o?.name) return o.name;
  if (d?.name) return d.name;
  if (p?.name) return p.name;
  return item?.location_name || item?.location_to || item?.location_from || item?.title || '';
}