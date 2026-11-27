// Pure flight-tracking rules shared by the flight status card, the journey
// cards and the Home brief. No rendering, no network: everything here is
// derived from the segment and the live feed so it can be tested directly.

// Tracking is emphasised from T-6h until 2h after landing, then the card falls
// back to its regular view.
export const TRACKING_BEFORE_MS = 6 * 60 * 60 * 1000;
export const TRACKING_AFTER_MS = 2 * 60 * 60 * 1000;
// Without a stored landing time, assume a 3h block so the window still closes.
const ASSUMED_BLOCK_MS = 3 * 60 * 60 * 1000;

// 'before' | 'active' | 'after'
export function trackingPhase({ startMs, endMs, nowMs = Date.now() } = {}) {
  if (!Number.isFinite(startMs)) return 'after';
  const landing = Number.isFinite(endMs) ? endMs : startMs + ASSUMED_BLOCK_MS;
  if (nowMs < startMs - TRACKING_BEFORE_MS) return 'before';
  if (nowMs <= landing + TRACKING_AFTER_MS) return 'active';
  return 'after';
}

// The chip vocabulary shown on cards: scheduled / boarding / delayed /
// in-air / landed / cancelled (plus diverted, which is not a delay).
const CHIP = {
  scheduled: 'scheduled',
  checkIn: 'scheduled',
  boarding: 'boarding',
  gateClosed: 'boarding',
  departed: 'inAir',
  approaching: 'inAir',
  arrived: 'landed',
  delayed: 'delayed',
  cancelled: 'cancelled',
  diverted: 'diverted',
};

export function chipKey(statusKey) {
  return CHIP[statusKey] || '';
}

// How much a single displayed field can be trusted:
//  high   — the feed is live and its own stamp is recent
//  medium — live feed, but the value is older than 30 minutes
//  low    — schedule-only record, or a value we estimated ourselves
//  none   — nothing to qualify (the field is not shown)
export const CONFIDENCE_FRESH_MS = 30 * 60 * 1000;

export function fieldConfidence({
  hasValue = false,
  live = false,
  updatedMs = null,
  estimated = false,
  nowMs = Date.now(),
} = {}) {
  if (!hasValue) return 'none';
  if (estimated) return 'low';
  if (!live) return 'low';
  if (!Number.isFinite(updatedMs)) return 'medium';
  return nowMs - updatedMs <= CONFIDENCE_FRESH_MS ? 'high' : 'medium';
}

// Age of the feed answer, for the "last updated X min ago" line.
export function freshness({ updatedMs, nowMs = Date.now() } = {}) {
  if (!Number.isFinite(updatedMs)) return { level: 'unknown', minutes: null };
  const minutes = Math.max(0, Math.round((nowMs - updatedMs) / 60000));
  const level = minutes <= 15 ? 'fresh' : minutes <= 90 ? 'recent' : 'stale';
  return { level, minutes };
}

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;
const toVec = (lat, lng) => {
  const phi = toRad(lat);
  const lambda = toRad(lng);
  return [Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)];
};
const fromVec = ([x, y, z]) => ({
  lat: toDeg(Math.atan2(z, Math.hypot(x, y))),
  lng: toDeg(Math.atan2(y, x)),
});

// Position along the great circle between two places at a given moment. Used
// only while the aircraft is airborne and the feed has no coordinates of its
// own, and always presented as an ESTIMATE, never as a live position.
export function interpolatedPosition({ from, to, startMs, endMs, nowMs = Date.now() } = {}) {
  if (!from || !to) return null;
  const a = Number(from.lat);
  const b = Number(from.lng);
  const c = Number(to.lat);
  const d = Number(to.lng);
  if (![a, b, c, d].every(Number.isFinite)) return null;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
  const raw = (nowMs - startMs) / (endMs - startMs);
  if (!(raw > 0)) return null;
  const progress = Math.min(1, raw);

  const v1 = toVec(a, b);
  const v2 = toVec(c, d);
  const dot = Math.min(1, Math.max(-1, v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]));
  const omega = Math.acos(dot);
  if (!omega) return { lat: a, lng: b, progress };
  const s1 = Math.sin((1 - progress) * omega) / Math.sin(omega);
  const s2 = Math.sin(progress * omega) / Math.sin(omega);
  const point = fromVec([
    v1[0] * s1 + v2[0] * s2,
    v1[1] * s1 + v2[1] * s2,
    v1[2] * s1 + v2[2] * s2,
  ]);
  return { lat: point.lat, lng: point.lng, progress };
}