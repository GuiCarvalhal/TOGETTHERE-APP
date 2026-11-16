import { base44 } from '@/api/base44Client';

// Shared, short-lived cache for the community signals (who travelled with you and
// what they collected). The summary card, the awards grid and the bucket list all
// read the same payload, so moving between the three sections costs ONE call.
// Failures are never cached, so a retry is honest.
const KEY = 'tt-community-signals-v1';
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

export function peekCommunitySignals() {
  if (memo && Date.now() - memo.at <= TTL) return memo.data;
  const stored = readStored();
  if (stored) memo = stored;
  return stored ? stored.data : null;
}

export function invalidateCommunitySignals() {
  memo = null;
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function loadCommunitySignals({ force = false } = {}) {
  if (!force) {
    const cached = peekCommunitySignals();
    if (cached) return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = base44.functions.invoke('getCommunitySignals', {})
    .then((res) => {
      const data = {
        peers: res?.data?.peers || [],
        upcoming: res?.data?.upcoming || [],
      };
      memo = { at: Date.now(), data };
      try { sessionStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* ignore */ }
      inflight = null;
      return data;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

// People who already earned THIS badge. The catalog compares the same threshold
// the user's own badge uses, so a face here always means the award is theirs.
export function peersForBadge(peers, badge) {
  if (!Array.isArray(peers) || !badge) return [];
  const stat = badge.topic?.stat;
  if (!stat) return [];
  return peers.filter((peer) => (Number(peer?.stats?.[stat]) || 0) >= badge.target);
}

// People you travelled with who have already been to this country.
export function peersForCountry(peers, code) {
  if (!Array.isArray(peers) || !code) return [];
  return peers.filter((peer) => Array.isArray(peer?.countries) && peer.countries.includes(code));
}