import { base44 } from '@/api/base44Client';

// Session cache for Google Directions legs: driving distance, duration and the
// route geometry, keyed by the exact routable pair ("origin|destination") the
// request was made on.
//
// Google Maps Platform allows route content to be cached ONLY temporarily, to
// improve performance — never stored permanently. So this cache:
//   • lives in memory for the session and mirrors into sessionStorage, so a
//     reload of the same tab does not repeat the calls (a new tab starts clean);
//   • expires: past FRESH_MS a leg is re-fetched when online, and past
//     MAX_AGE_MS it is dropped entirely (well inside Google's 30-day limit);
//   • never touches the database — no route data is written to any record.
const STORAGE_KEY = 'tt.routeLegs.v1';
const FRESH_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

const cache = new Map();
let hydrated = false;

export function routeLegKey(origin, destination) {
  return `${origin}|${destination}`;
}

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) || {};
    Object.keys(parsed).forEach((key) => {
      const entry = parsed[key];
      if (entry && typeof entry.fetchedAt === 'number') cache.set(key, entry);
    });
  } catch {
    /* private mode / quota: memory-only cache */
  }
}

function persist() {
  try {
    const obj = {};
    [...cache.entries()].slice(-MAX_ENTRIES).forEach(([key, entry]) => { obj[key] = entry; });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore */
  }
}

export function isRouteFresh(entry) {
  if (!entry) return false;
  return Date.now() - (entry.fetchedAt || 0) <= FRESH_MS;
}

// A cached leg, or null. `allowStale` is what offline reading uses: the numbers
// and geometry are still shown (clearly marked as possibly outdated) instead of
// dropping the route the moment it stops being fresh.
export function getCachedRoute(origin, destination, { allowStale = false } = {}) {
  hydrate();
  const key = routeLegKey(origin, destination);
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - (entry.fetchedAt || 0);
  if (age > MAX_AGE_MS) { cache.delete(key); return null; }
  if (!allowStale && age > FRESH_MS) return null;
  return entry;
}

// Resolves a list of legs in ONE call, asking Google only about the legs the
// session does not already hold. `force` re-measures everything (the toolbar's
// Refresh). Returns { byKey, fetched } where byKey covers every requested leg
// that has a usable result. A failed leg is never cached, so a later run can
// retry it.
export async function fetchRouteLegs(legs, { force = false } = {}) {
  hydrate();
  const unique = new Map();
  (legs || []).forEach((leg) => {
    if (!leg || !leg.origin || !leg.destination) return;
    unique.set(routeLegKey(leg.origin, leg.destination), { origin: leg.origin, destination: leg.destination });
  });

  const byKey = {};
  const missing = [];
  unique.forEach((leg, key) => {
    const entry = cache.get(key);
    const age = entry ? Date.now() - (entry.fetchedAt || 0) : Infinity;
    if (entry && age > MAX_AGE_MS) cache.delete(key);
    else if (entry) {
      byKey[key] = entry;
      if (!force && age <= FRESH_MS) return;
    }
    missing.push({ key, origin: leg.origin, destination: leg.destination });
  });

  if (missing.length === 0) return { byKey, fetched: 0 };

  // One request per 50 legs: the endpoint caps a batch at 60, and a long journey
  // can legitimately have more legs than that.
  const BATCH = 50;
  for (let start = 0; start < missing.length; start += BATCH) {
    const batch = missing.slice(start, start + BATCH);
    const res = await base44.functions.invoke('getJourneyLegRoutes', {
      legs: batch.map(({ origin, destination }) => ({ origin, destination })),
    });
    const results = (res?.data || res)?.results || [];
    batch.forEach((leg, i) => {
      const r = results[i];
      if (!r || !r.ok) return;
      const entry = {
        ok: true,
        distanceMeters: typeof r.distanceMeters === 'number' ? r.distanceMeters : null,
        durationSeconds: typeof r.durationSeconds === 'number' ? r.durationSeconds : null,
        polyline: typeof r.polyline === 'string' ? r.polyline : '',
        fetchedAt: Date.now(),
      };
      cache.set(leg.key, entry);
      byKey[leg.key] = entry;
    });
  }
  persist();
  return { byKey, fetched: missing.length };
}