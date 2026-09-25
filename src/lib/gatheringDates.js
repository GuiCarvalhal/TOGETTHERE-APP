// Derived gathering dates + destination helpers for TOGETTHERE.
//
// A gathering's date range is DERIVED from its journey items, never typed:
//   a) items the current user is part of (attendee or creator) — earliest..latest
//   b) fall back to the FULL set of items — earliest..latest
//   c) fall back to legacy start_date / end_date
//   d) "Dates TBD"
//
// Used everywhere a gathering range is displayed or sorted (Home cards,
// gathering header, filters, ordering). Pure functions — callers supply the
// items (fetched server-side) and the current user id.

import { formatDate } from '@/lib/gatheringHelpers';

// Same participation notion as the journey page's MINE scope: explicit
// attendee (attendee_user_ids) or the item creator (owner_id). owner_user_id
// (the gathering owner, set on every item) is intentionally NOT used.
export function itemInvolvesUser(item, userId) {
  if (!userId) return false;
  if (item.owner_id === userId) return true;
  return (item.attendee_user_ids || []).includes(userId);
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
export function deriveGatheringRange(gathering, items, userId) {
  const all = items || [];
  const mine = all.filter((it) => itemInvolvesUser(it, userId));
  const r = rangeFromItems(mine.length ? mine : all);
  if (r) return { start: r.start, end: r.end, hasRange: true };
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
export function gatheringDateStatus(gathering, items, userId, now = new Date()) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId);
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
export function gatheringSortKey(gathering, items, userId, now = new Date()) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId);
  if (!hasRange) return { bucket: 3, ts: 0 };
  if (start && end && now >= start && now <= end) return { bucket: 0, ts: start.getTime() };
  if (start && now < start) return { bucket: 1, ts: start.getTime() };
  return { bucket: 2, ts: -(end ? end.getTime() : start.getTime()) }; // past: end DESC
}

// Format a derived range for display ("Oct 12 – Oct 19"), or '' when TBD.
export function formatGatheringRange(gathering, items, userId) {
  const { start, end, hasRange } = deriveGatheringRange(gathering, items, userId);
  if (!hasRange) return '';
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// ---- Destinations ----

// A display list of destinations, handling both new structured places and
// legacy free-text strings. Each entry: { name, place_id?, address?, lat?, lng? }.
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