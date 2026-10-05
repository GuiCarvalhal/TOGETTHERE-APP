// Derived gathering dates + destination helpers for TOGETTHERE.
//
// A gathering's date range and location are DERIVED from its journey items,
// never typed:
//
// DATES:
//   a) Main Event (if one exists) — prevails globally over any other derivation
//   b) items the current user participates in (attendee or, for non-flight
//      only, creator) — earliest..latest
//   c) fall back to the FULL set of items (Viewer, or user has no own items)
//   d) fall back to legacy start_date / end_date
//   e) "Dates TBD"
//
// LOCATION:
//   a) Main Event (if one exists) — prevails globally
//   b) lodging + activities the user participates in (excludes flights and
//      all transport: car/train/cruise)
//   c) fall back to the gathering's full set of lodging + activities
//   d) [] (no derived location)
//
// Participation = explicit attendee (attendee_user_ids) or, for NON-FLIGHT
// items only, the item creator (owner_id). Flights never fall back to the
// creator: an empty attendee list means "no one joined yet". owner_user_id
// (the gathering owner) and member_user_ids (the ACL read list) are
// intentionally NEVER used — neither is evidence of participation.
//
// Used everywhere a gathering range/location is displayed or sorted (Home
// cards, gathering header, filters, ordering). Pure functions — callers
// supply the items (fetched server-side) and the current user id + role.

import { formatDate } from '@/lib/gatheringHelpers';

// Participation notion: explicit attendee, or creator for non-flight only.
// owner_user_id (gathering owner) and member_user_ids (ACL) are never used.
export function itemInvolvesUser(item, userId) {
  if (!userId) return false;
  if ((item.attendee_user_ids || []).includes(userId)) return true;
  if (item.type === 'flight') return false; // flights: attendees only
  if (item.owner_id === userId) return true;
  return false;
}

// Earliest start .. latest end across a set of items (end falls back to start).
// Returns null when no item has any datetime.
export function rangeFromItems(items) {
  let start = null;
  let end = null;
  for (const it of items || []) {
    const s = it.start_datetime ? new Date(it.start_datetime) : null;
    const e = it.end_datetime ? new Date(it.end_datetime) : s;
    if (s) { if (!start || s < start) start = s; }
    if (e) { if (!end || e > end) end = e; }
  }
  if (!start) return null;
  return { start, end: end || start };
}

// Main derivation. Returns { start: Date|null, end: Date|null, hasRange: bool }.
// `role` is optional — when 'viewer', the user's own items are skipped and the
// gathering's full set is used directly (viewers don't "participate" in items).
export function deriveGatheringRange(gathering, items, userId, role) {
  const all = items || [];

  // Main Event prevails globally
  const mainEvent = all.find((it) => it.type === 'main_event');
  if (mainEvent) {
    const r = rangeFromItems([mainEvent]);
    if (r) return { start: r.start, end: r.end, hasRange: true };
  }

  // Without Main Event: derive from the user's own items (non-viewer)
  const isViewer = role === 'viewer';
  if (!isViewer && userId) {
    const mine = all.filter((it) => itemInvolvesUser(it, userId));
    if (mine.length) {
      const r = rangeFromItems(mine);
      if (r) return { start: r.start, end: r.end, hasRange: true };
    }
  }

  // Fall back to the gathering's full set (Viewer, or user has no own items)
  const r = rangeFromItems(all);
  if (r) return { start: r.start, end: r.end, hasRange: true };

  // Legacy typed dates
  if (gathering?.start_date || gathering?.end_date) {
    const s = gathering.start_date ? new Date(gathering.start_date + 'T00:00:00') : null;
    const e = gathering.end_date ? new Date(gathering.end_date + 'T23:59:59') : s;
    return { start: s, end: e || s, hasRange: true };
  }
  return { start: null, end: null, hasRange: false };
}

// Relative-time status from the DERIVED range.
// key:   'ongoing' | 'upcoming' | 'past' | 'tbd'
// label: "In progress" | "In 3 days" | "Ended Aug 27" | "Dates TBD"
// tone:  'green' | 'terra' | 'muted' (kept for any caller that still wants one)
export function gatheringDateStatus(gathering, items, userId, role, now = new Date()) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId, role);
  if (!hasRange) return { key: 'tbd', label: 'Dates TBD', tone: 'muted' };
  if (start && now < start) {
    const days = Math.ceil((start - now) / 86400000);
    return { key: 'upcoming', label: days <= 0 ? 'Starts today' : days === 1 ? 'Tomorrow' : `In ${days} days`, tone: 'terra' };
  }
  if (start && end && now >= start && now <= end) return { key: 'ongoing', label: 'In progress', tone: 'green' };
  if (end && now > end) return { key: 'past', label: `Ended ${formatDate(end)}`, tone: 'muted' };
  return { key: 'tbd', label: 'Dates TBD', tone: 'muted' };
}

// Sort key for Home ordering: ongoing first, then future (nearest first),
// then past (most recent first), then TBD last. Compare by bucket asc, ts asc.
export function gatheringSortKey(gathering, items, userId, role, now = new Date()) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId, role);
  if (!hasRange) return { bucket: 3, ts: 0 };
  if (start && end && now >= start && now <= end) return { bucket: 0, ts: start.getTime() };
  if (start && now < start) return { bucket: 1, ts: start.getTime() };
  return { bucket: 2, ts: -(end ? end.getTime() : start.getTime()) }; // past: end DESC
}

// Format a derived range for display ("Oct 12 – Oct 19"), or '' when TBD.
export function formatGatheringRange(gathering, items, userId, role) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId, role);
  if (!hasRange) return '';
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// ---- Location ----

// Location-bearing types: lodging and activities only. Excludes flights and
// all transport (car, train, cruise) — those are movement, not destinations.
// Main Event is always location-bearing (it has a `place`).
const LOCATION_TYPES = new Set(['hotel', 'activity', 'main_event']);

function locationFromItem(it) {
  if (it.place?.name) {
    return { name: it.place.name, place_id: it.place.place_id || null, lat: it.place.lat, lng: it.place.lng };
  }
  if (it.location_name) {
    return { name: it.location_name };
  }
  return null;
}

// Derives a display location list from the gathering's journey items. Main
// Event prevails (returns a single-element list); otherwise the lodging +
// activities the user participates in (excludes flights/transport), falling
// back to the gathering's full set of lodging + activities for viewers or
// when the user has no own location-bearing items. Deduplicates by place_id
// or name, preserves order, caps at 3 for display. Returns [] when no
// location-bearing item exists.
export function deriveGatheringLocation(items, userId, role) {
  const all = items || [];

  // Main Event prevails globally
  const mainEvent = all.find((it) => it.type === 'main_event');
  if (mainEvent) {
    const loc = locationFromItem(mainEvent);
    return loc ? [loc] : [];
  }

  // Relevant items: lodging + activities the user participates in
  const isViewer = role === 'viewer';
  const userItems = isViewer ? [] : all.filter((it) =>
    LOCATION_TYPES.has(it.type) && itemInvolvesUser(it, userId)
  );
  const locItems = userItems.length
    ? userItems
    : all.filter((it) => LOCATION_TYPES.has(it.type));

  // Deduplicate by place_id or name, preserve order
  const seen = new Set();
  const result = [];
  for (const it of locItems) {
    const loc = locationFromItem(it);
    if (!loc) continue;
    const key = loc.place_id || loc.name;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(loc);
  }
  return result.slice(0, 3);
}

// ---- Legacy destinations (stored on the Gathering entity) ----

// A display list of destinations, handling both new structured places and
// legacy free-text strings. Each entry: { name, place_id?, address?, lat?, lng? }.
// NOTE: new gatherings no longer collect destinations; this is kept for
// backward compatibility with existing records and for the Settings page.
export function gatheringDestinations(g) {
  const places = g?.destination_places;
  if (Array.isArray(places) && places.length) {
    return places.map((p) => (typeof p === 'string' ? { name: p } : p));
  }
  return (g?.destinations || []).map((s) => ({ name: s }));
}

// External Google Maps link for a destination (place_id preferred, else lat/lng).
export function destinationMapsUrl(p) {
  if (!p) return '';
  if (p.place_id) return `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(p.place_id)}`;
  if (p.lat != null && p.lng != null) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return '';
}