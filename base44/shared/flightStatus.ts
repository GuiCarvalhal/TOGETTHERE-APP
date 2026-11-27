import { fetchFlightsLiveByNumber } from './aeroDataBox.ts';

// Live flight status is expensive and rate limited (the provider answers 429
// once the quota for the window is spent, and a silent 429 is exactly what made
// the app claim "the gate posts closer to departure" for a gate that was
// already published). So every caller — Home's Next/Now brief and the flight
// item detail card — reads and writes ONE cache row per flight + date:
//
//   • outside the departure window the answer is reused for 6 hours;
//   • from 4 hours before departure until 12 hours after it, the answer is
//     refreshed on every load (with a 5 minute floor, so opening the Home brief
//     and the detail card back to back costs a single call);
//   • a provider failure keeps the last good answer and is not retried for
//     30 minutes, so a spent quota never turns into a request storm.
export const FLIGHT_STATUS_TTL_MS = 6 * 60 * 60 * 1000;
export const FLIGHT_STATUS_HOT_WINDOW_MS = 4 * 60 * 60 * 1000;
export const FLIGHT_STATUS_AFTER_MS = 12 * 60 * 60 * 1000;
export const FLIGHT_STATUS_HOT_FLOOR_MS = 5 * 60 * 1000;
export const FLIGHT_STATUS_RETRY_MS = 30 * 60 * 1000;

// A number that answers more than two days away from the segment's own
// departure is a different rotation, not this flight.
const MATCH_TOLERANCE_MS = 48 * 60 * 60 * 1000;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Provider local strings look like "2026-11-13 18:10+01:00".
export function instantMs(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(' ', 'T').replace(/(\d{2}:\d{2})([+-]\d{2}:\d{2})$/, '$1:00$2');
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

// The provider files a number by the date the airline operates it and returns
// every rotation it holds for that date — asking for 26 Nov for a nightly
// AA930 also returns the 25 Nov one, which was the FIRST entry and therefore
// what the app used to show: a flight from the day before, already arrived and
// with no gate. Pick the rotation whose scheduled departure is closest to the
// segment's own departure instead of trusting the order.
export function pickFlight(flights, targetMs) {
  const list = (flights || []).filter((f) => f && !f.codeshare);
  if (!list.length) return null;
  if (targetMs === null) return list[0];
  let best = null;
  let bestDiff = Infinity;
  for (const f of list) {
    const ms = instantMs(f.departure?.scheduled);
    if (ms === null) continue;
    const diff = Math.abs(ms - targetMs);
    if (diff < bestDiff) {
      best = f;
      bestDiff = diff;
    }
  }
  return best && bestDiff <= MATCH_TOLERANCE_MS ? best : null;
}

async function saveRow(base44, row, patch) {
  const entity = base44.asServiceRole.entities.FlightStatusCache;
  return row?.id ? entity.update(row.id, patch) : entity.create(patch);
}

// codes/dates are candidate designators and calendar dates in priority order
// (a segment sometimes stores the airline's booking code instead of the flight
// number, and the provider may file a flight under the UTC or the local date).
export async function resolveLiveFlight(base44, { rapidKey, codes, dates, departureAt, force = false }) {
  const codeList = (codes || []).map((c) => text(c)).filter(Boolean);
  const dateList = (dates || []).map((d) => text(d)).filter(Boolean);
  const empty = { flight: null, fetchedAt: '', stale: false, fromCache: false };
  if (!rapidKey || !codeList.length || !dateList.length) return empty;

  const cacheKey = `${codeList[0]}|${dateList[0]}`;
  const now = Date.now();
  const targetMs = instantMs(departureAt);

  let row = null;
  try {
    const page = await base44.asServiceRole.entities.FlightStatusCache.filter({ cache_key: cacheKey }, { limit: 1 });
    row = (Array.isArray(page) ? page : page.items || [])[0] || null;
  } catch {
    row = null;
  }

  const fetchedMs = row?.fetched_at ? Date.parse(row.fetched_at) : 0;
  const attemptMs = row?.last_attempt_at ? Date.parse(row.last_attempt_at) : 0;
  const hot = targetMs !== null
    && targetMs - now <= FLIGHT_STATUS_HOT_WINDOW_MS
    && now - targetMs <= FLIGHT_STATUS_AFTER_MS;
  const ttl = hot ? FLIGHT_STATUS_HOT_FLOOR_MS : FLIGHT_STATUS_TTL_MS;
  const cached = { flight: row?.payload || null, fetchedAt: row?.fetched_at || '', stale: false, fromCache: true };

  if (!force) {
    if (fetchedMs && now - fetchedMs < ttl) return cached;
    if (attemptMs && now - attemptMs < FLIGHT_STATUS_RETRY_MS) return { ...cached, stale: true };
  }

  let flight = null;
  let failed = false;
  let attempts = 0;
  outer: for (const date of dateList) {
    for (const code of codeList) {
      if (attempts >= 3) break outer;
      attempts += 1;
      try {
        const found = pickFlight(await fetchFlightsLiveByNumber(rapidKey, code, date), targetMs);
        if (found) {
          flight = found;
          break outer;
        }
      } catch {
        failed = true;
      }
    }
  }

  const stamp = new Date().toISOString();
  try {
    if (flight || !failed) {
      // A clean answer, including "the provider has no such flight", is stored
      // for the whole window so a miss never re-costs a call on every load.
      const saved = await saveRow(base44, row, {
        cache_key: cacheKey,
        flight_number: codeList[0],
        flight_date: dateList[0],
        payload: flight,
        found: !!flight,
        fetched_at: stamp,
        last_attempt_at: stamp,
        last_updated_utc: text(flight?.lastUpdatedUtc),
      });
      return { flight, fetchedAt: saved?.fetched_at || stamp, stale: false, fromCache: false };
    }
    if (row?.payload) {
      // Provider unreachable: keep the last good answer, only move the backoff.
      await saveRow(base44, row, { last_attempt_at: stamp });
      return { flight: row.payload, fetchedAt: row.fetched_at || '', stale: true, fromCache: true };
    }
    await saveRow(base44, row, { cache_key: cacheKey, flight_number: codeList[0], flight_date: dateList[0], found: false, last_attempt_at: stamp });
  } catch {
    // The cache is best-effort: the caller still gets the provider answer.
  }

  return { flight, fetchedAt: flight ? stamp : '', stale: failed, fromCache: false };
}