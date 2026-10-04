// TOGETTHERE offline read-only cache — IndexedDB snapshot manager.
//
// Stores per-user, per-gathering snapshots of data the authenticated user has
// ALREADY successfully retrieved online (gathering context, journey items,
// expenses). The standalone /offline.html (synthesized by the service worker
// from /offline-shell.js + /offline-shell.css) reads these snapshots with no
// network/SDK/React. No auth tokens are stored. No service-role data. Viewer
// snapshots NEVER include expenses — and demotion to viewer DELETES any
// previously stored expense snapshot.
//
// Partitioning: every entry is keyed `${userId}:${gatheringId}`. An active-user
// marker in the meta store tracks the current account; switching accounts
// purges the previous user's data. Logout purges everything. Authoritative
// 401/403 (server revocation) purges everything; transient network failures
// never purge.
//
// Race protection: every save checks the active-user marker BEFORE writing and
// aborts if the user changed (logout/account switch mid-save). A per-key write
// lock serializes concurrent saves for the same user+gathering.
//
// TTL: 7 days. Bounds: max 50 gatherings per user, max 200 items/expenses per
// gathering. Expired entries are filtered on read and pruned opportunistically.
//
// Error reporting: save failures are surfaced via setOfflineSaveError (never
// silently swallowed). Read failures THROW (callers distinguish no-data vs
// cache-unavailable).

import { setOfflineSaveError, clearOfflineSaveError } from '@/lib/offlineSaveStatus';

const DB_NAME = 'tt-offline';
const DB_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max
const MAX_GATHERINGS = 50;
const MAX_ITEMS = 200;
const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'];

const STORES = {
  META: 'meta',
  GATHERINGS: 'gatherings',
  JOURNEY: 'journey',
  EXPENSES: 'expenses',
};

// ─── Pure logic (testable without IndexedDB) ──────────────────────

export function snapshotKey(userId, gatheringId) {
  return `${userId}:${gatheringId}`;
}

export function isExpired(entry, now = Date.now()) {
  if (!entry || !entry.expiresAt) return true;
  return entry.expiresAt < now;
}

export function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

export function shouldStoreExpenses(role) {
  // Reject unknown/null role — never default to member for authorization.
  if (!isValidRole(role)) return false;
  return role !== 'viewer';
}

// SW cache prune policy — only prune app-owned tt-shell-* caches.
// OneSignal and other unrelated caches are never touched.
export function shouldPruneCache(cacheName) {
  return typeof cacheName === 'string' && cacheName.startsWith('tt-shell-');
}

export function extractGatheringMeta(gathering) {
  if (!gathering) return null;
  return {
    name: gathering.name || '',
    cover_image: gathering.cover_image || '',
    destinations: (gathering.destinations || []).slice(0, 10),
    destination_places: (gathering.destination_places || []).map((d) => ({
      name: d.name || '', lat: d.lat, lng: d.lng,
    })).slice(0, 10),
  };
}

export function extractMinimalMember(member) {
  if (!member) return null;
  return {
    id: member.id || '', // REQUIRED for expense payer_member_id → payer name lookup
    user_id: member.user_id || '',
    full_name: member.full_name || '',
    role: member.role || 'member',
    photo: member.photo || '',
  };
}

export function extractJourneyItem(item) {
  if (!item) return null;
  const place = (p) => p ? {
    name: p.name || '', city: p.city || '', country: p.country || '',
    tz: p.tz || '', iata: p.iata || '',
  } : null;
  return {
    id: item.id,
    type: item.type || 'other',
    title: item.title || '',
    start_datetime: item.start_datetime || null,
    end_datetime: item.end_datetime || null,
    location_from: item.location_from || '',
    location_to: item.location_to || '',
    location_name: item.location_name || '',
    confirmation_number: item.confirmation_number || '',
    airline: item.airline || '',
    notes: item.notes || '',
    place: place(item.place),
    from_place: place(item.from_place),
    to_place: place(item.to_place),
    attendee_user_ids: (item.attendee_user_ids || []).slice(0, 50),
    owner_id: item.owner_id || '',
  };
}

export function extractExpense(expense) {
  if (!expense) return null;
  return {
    id: expense.id,
    title: expense.title || '',
    amount: Number(expense.amount) || 0,
    currency: (expense.currency || 'USD').toUpperCase(),
    payer_member_id: expense.payer_member_id || '',
    category: expense.category || 'other',
    date: expense.date || '',
    notes: expense.notes || '',
    place_name: expense.place_name || '',
    settled: !!expense.settled,
  };
}

// SW cache policy — same logic inlined in OneSignalSDKWorker.js.
// Exported here so tests validate the exact rules the SW uses.
// ALLOWLIST approach: only /assets/ + exact public files are cacheable.
export function shouldCacheUrl(url, method, appOrigin) {
  if (!url || !appOrigin) return false;
  if (method !== 'GET') return false;
  if (url.origin !== appOrigin) return false;
  const p = url.pathname;
  // Denylist: never cache auth, API, tokens, files, receipts.
  if (p.startsWith('/functions/')) return false;
  if (p.includes('/api/')) return false;
  if (p === '/login' || p.startsWith('/login/') ||
      p === '/register' || p.startsWith('/register/') ||
      p === '/forgot-password' || p.startsWith('/forgot-password/') ||
      p === '/reset-password' || p.startsWith('/reset-password/')) return false;
  if (p.startsWith('/auth') || p.startsWith('/callback')) return false;
  if (p.startsWith('/files/') || p.startsWith('/uploads/')) return false;
  if (p.includes('receipt')) return false;
  // Reject auth-related query params (tokens in URL).
  const q = url.searchParams;
  if (q.has('token') || q.has('code') || q.has('access_token') || q.has('reset_token')) return false;
  // offline.html is served as a synthetic SW response — don't cache via fetch.
  if (p === '/offline.html') return false;
  // Allowlist: only /assets/ and exact public files.
  if (p.startsWith('/assets/')) return true;
  const ALLOWED_EXACT = ['/icon.svg', '/manifest.json', '/offline-shell.js', '/offline-shell.css',
    '/favicon.ico', '/icon-192.png', '/icon-512.png'];
  return ALLOWED_EXACT.includes(p);
}

// Kept for backward compat with existing tests. The SW no longer uses this —
// shouldCacheUrl (allowlist) is the authoritative gatekeeper.
export function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico|map)(\?|$)/.test(url.pathname);
}

// ─── IndexedDB operations ─────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORES.GATHERINGS)) db.createObjectStore(STORES.GATHERINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.JOURNEY)) db.createObjectStore(STORES.JOURNEY, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.EXPENSES)) db.createObjectStore(STORES.EXPENSES, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function storeReq(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function asPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function userRange(userId) {
  const prefix = `${userId}:`;
  return IDBKeyRange.bound(prefix, prefix + '\uffff');
}

// Per-key write lock — serializes concurrent saves for the same user+gathering.
const writeLocks = new Map();
function withLock(key, fn) {
  const prev = writeLocks.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  writeLocks.set(key, next.catch(() => {}));
  return next;
}

// Check that the active user still matches before committing a write.
// Returns true if the write should proceed, false if the user changed.
async function assertActiveUser(db, userId) {
  const active = await asPromise(storeReq(db, STORES.META, 'readonly').get('activeUser'));
  return !active?.value || active.value === userId;
}

export async function setActiveUser(userId) {
  if (!userId) return;
  try {
    const db = await openDB();
    const existing = await asPromise(storeReq(db, STORES.META, 'readonly').get('activeUser'));
    if (existing && existing.value && existing.value !== userId) {
      await purgeUser(db, existing.value);
    }
    await asPromise(storeReq(db, STORES.META, 'readwrite').put({ key: 'activeUser', value: userId }));
    db.close();
  } catch (e) {
    setOfflineSaveError(e);
  }
}

export async function getActiveUser() {
  const db = await openDB(); // throws on IDB failure
  const result = await asPromise(storeReq(db, STORES.META, 'readonly').get('activeUser'));
  db.close();
  return result?.value || null;
}

async function purgeUser(db, userId) {
  const range = userRange(userId);
  await Promise.all([
    asPromise(storeReq(db, STORES.GATHERINGS, 'readwrite').delete(range)),
    asPromise(storeReq(db, STORES.JOURNEY, 'readwrite').delete(range)),
    asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').delete(range)),
  ]);
}

export async function purgeAll() {
  try {
    const db = await openDB();
    await Promise.all([
      asPromise(storeReq(db, STORES.META, 'readwrite').clear()),
      asPromise(storeReq(db, STORES.GATHERINGS, 'readwrite').clear()),
      asPromise(storeReq(db, STORES.JOURNEY, 'readwrite').clear()),
      asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').clear()),
    ]);
    db.close();
  } catch (e) {
    setOfflineSaveError(e);
  }
}

// Purge on authoritative 401/403 from the server (not transient network errors).
export function purgeOnAuthError(error) {
  if (error && (error.status === 401 || error.status === 403)) {
    purgeAll().catch(() => {});
    return true;
  }
  return false;
}

// Enforce max gatherings per user — prune oldest when exceeding the bound.
async function enforceGatheringBound(db, userId) {
  const all = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').getAll(userRange(userId)));
  if (all.length <= MAX_GATHERINGS) return;
  const sorted = all.sort((a, b) => a.snapshotAt - b.snapshotAt);
  const toDelete = sorted.slice(0, all.length - MAX_GATHERINGS);
  for (const e of toDelete) {
    await asPromise(storeReq(db, STORES.GATHERINGS, 'readwrite').delete(e.id));
  }
}

export async function saveGatheringSnapshot(userId, gatheringId, role, { gathering, members }) {
  if (!userId || !gatheringId) return { ok: false, reason: 'invalid-args' };
  if (!isValidRole(role)) return { ok: false, reason: 'invalid-role' };
  return withLock(`${userId}:${gatheringId}`, async () => {
    try {
      const db = await openDB();
      if (!(await assertActiveUser(db, userId))) { db.close(); return { ok: false, reason: 'user-changed' }; }
      const now = Date.now();
      await asPromise(storeReq(db, STORES.GATHERINGS, 'readwrite').put({
        id: snapshotKey(userId, gatheringId),
        userId, gatheringId,
        gathering: extractGatheringMeta(gathering),
        role,
        members: (members || []).map(extractMinimalMember).filter(Boolean),
        snapshotAt: now,
        expiresAt: now + TTL_MS,
      }));
      await enforceGatheringBound(db, userId);
      db.close();
      clearOfflineSaveError();
      return { ok: true };
    } catch (e) {
      setOfflineSaveError(e);
      return { ok: false, error: e };
    }
  });
}

export async function saveJourneyItems(userId, gatheringId, items) {
  if (!userId || !gatheringId) return { ok: false, reason: 'invalid-args' };
  return withLock(`${userId}:${gatheringId}:j`, async () => {
    try {
      const db = await openDB();
      if (!(await assertActiveUser(db, userId))) { db.close(); return { ok: false, reason: 'user-changed' }; }
      const now = Date.now();
      await asPromise(storeReq(db, STORES.JOURNEY, 'readwrite').put({
        id: snapshotKey(userId, gatheringId),
        userId, gatheringId,
        // Bound: max MAX_ITEMS items per gathering (truncate oldest-first by sort).
        items: (items || []).slice(0, MAX_ITEMS).map(extractJourneyItem).filter(Boolean),
        snapshotAt: now,
        expiresAt: now + TTL_MS,
      }));
      db.close();
      clearOfflineSaveError();
      return { ok: true };
    } catch (e) {
      setOfflineSaveError(e);
      return { ok: false, error: e };
    }
  });
}

export async function saveExpenses(userId, gatheringId, role, expenses) {
  if (!userId || !gatheringId) return { ok: false, reason: 'invalid-args' };
  if (!isValidRole(role)) return { ok: false, reason: 'invalid-role' };
  return withLock(`${userId}:${gatheringId}:e`, async () => {
    try {
      const db = await openDB();
      if (!(await assertActiveUser(db, userId))) { db.close(); return { ok: false, reason: 'user-changed' }; }
      // Viewer: DELETE any previously stored expense snapshot (demotion purge).
      // This is an active deletion, not just skipping the save.
      if (!shouldStoreExpenses(role)) {
        await asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').delete(snapshotKey(userId, gatheringId)));
        db.close();
        clearOfflineSaveError();
        return { ok: true, deleted: true };
      }
      const now = Date.now();
      await asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').put({
        id: snapshotKey(userId, gatheringId),
        userId, gatheringId,
        expenses: (expenses || []).slice(0, MAX_ITEMS).map(extractExpense).filter(Boolean),
        snapshotAt: now,
        expiresAt: now + TTL_MS,
      }));
      db.close();
      clearOfflineSaveError();
      return { ok: true };
    } catch (e) {
      setOfflineSaveError(e);
      return { ok: false, error: e };
    }
  });
}

export async function deleteExpenses(userId, gatheringId) {
  if (!userId || !gatheringId) return { ok: false, reason: 'invalid-args' };
  return withLock(`${userId}:${gatheringId}:e`, async () => {
    try {
      const db = await openDB();
      await asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').delete(snapshotKey(userId, gatheringId)));
      db.close();
      return { ok: true };
    } catch (e) {
      setOfflineSaveError(e);
      return { ok: false, error: e };
    }
  });
}

// Reads THROW on IDB failure — callers distinguish no-data vs cache-unavailable.
export async function getGatheringsForUser(userId) {
  if (!userId) return [];
  const db = await openDB();
  const now = Date.now();
  const all = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').getAll(userRange(userId)));
  db.close();
  return (all || []).filter((e) => !isExpired(e, now));
}

export async function getGatheringSnapshot(userId, gatheringId) {
  if (!userId || !gatheringId) return null;
  const db = await openDB();
  const id = snapshotKey(userId, gatheringId);
  const now = Date.now();
  const g = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').get(id));
  if (!g || isExpired(g, now)) { db.close(); return null; }
  const j = await asPromise(storeReq(db, STORES.JOURNEY, 'readonly').get(id));
  const ex = await asPromise(storeReq(db, STORES.EXPENSES, 'readonly').get(id));
  db.close();
  return {
    gathering: g.gathering,
    role: g.role,
    members: g.members,
    snapshotAt: g.snapshotAt,
    journeyItems: (j && !isExpired(j, now)) ? j.items : [],
    journeySnapshotAt: (j && !isExpired(j, now)) ? j.snapshotAt : null,
    expenses: (ex && !isExpired(ex, now)) ? ex.expenses : null,
    expensesSnapshotAt: (ex && !isExpired(ex, now)) ? ex.snapshotAt : null,
  };
}

export async function pruneExpired() {
  try {
    const db = await openDB();
    const now = Date.now();
    for (const name of [STORES.GATHERINGS, STORES.JOURNEY, STORES.EXPENSES]) {
      const all = await asPromise(storeReq(db, name, 'readonly').getAll());
      for (const entry of all) {
        if (isExpired(entry, now)) {
          await asPromise(storeReq(db, name, 'readwrite').delete(entry.id));
        }
      }
    }
    db.close();
  } catch (e) {
    setOfflineSaveError(e);
  }
}

export { TTL_MS, MAX_GATHERINGS, MAX_ITEMS, STORES, VALID_ROLES };