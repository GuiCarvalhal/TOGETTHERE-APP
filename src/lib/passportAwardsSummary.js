import { base44 } from '@/api/base44Client';

// Shared, short-lived cache for the Passport & Awards numbers. Home's banner and
// the area's Overview both read it, so opening Home and then the area costs ONE
// pair of calls instead of four. TTL is deliberately short: these numbers move
// when a trip is added, and a stale badge must never outlive a refresh.
const KEY = 'tt-pa-summary-v1';
const TTL = 60 * 1000;

let memo = null;
let inflight = null;

function readStored() {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > TTL) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Synchronous peek — lets a component paint cached numbers on first render.
export function peekPassportAwards() {
  if (memo && Date.now() - memo.at <= TTL) return memo.data;
  const stored = readStored();
  if (stored) memo = stored;
  return stored ? stored.data : null;
}

function store(data) {
  memo = { at: Date.now(), data };
  try { sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* ignore */ }
}

export function invalidatePassportAwards() {
  memo = null;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

// One round trip for both halves. Failures are NOT cached so a retry is honest.
export function loadPassportAwards({ force = false } = {}) {
  if (!force) {
    const cached = peekPassportAwards();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = Promise.all([
    base44.functions.invoke('getPassport', {}),
    base44.functions.invoke('getAchievements', {}),
  ])
    .then(([passportRes, achievementsRes]) => {
      const passport = passportRes?.data || {};
      const data = {
        stats: passport.stats || { countries: 0, bucket: 0, trips: 0 },
        visited: passport.visited || [],
        bucket: passport.bucket || [],
        achievements: achievementsRes?.data?.stats || null,
      };
      store(data);
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}