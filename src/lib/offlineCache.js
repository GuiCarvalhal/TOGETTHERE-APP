// TOGETTHERE offline read-only cache — IndexedDB snapshot manager.
//
// Stores per-user, per-gathering snapshots of data the authenticated user has
// ALREADY successfully retrieved online (gathering context, journey items,
// expenses). The standalone /offline.html reads these snapshots with no
// network/SDK/React. No auth tokens are stored. No service-role data. Viewer
// snapshots NEVER include expenses.
//
// Partitioning: every entry is keyed `${userId}:${gatheringId}`. An active-user
// marker in the meta store tracks the current account; switching accounts
// purges the previous user's data. Logout purges everything. Authoritative
// 401/403 (server revocation) purges everything; transient network failures
// never purge.
//
// TTL: 7 days. Expired entries are filtered on read and pruned opportunistically.

const DB_NAME = 'tt-offline';
const DB_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max

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

export function shouldStoreExpenses(role) {
  return role === 'owner' || role === 'admin' || role === 'member';
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
export function shouldCacheUrl(url, method, appOrigin) {
  if (!url || !appOrigin) return false;
  if (method !== 'GET') return false;
  if (url.origin !== appOrigin) return false;
  const p = url.pathname;
  // NEVER cache API/auth/function responses, tokens, receipts, or files.
  if (p.startsWith('/functions/')) return false;
  if (p.includes('/api/')) return false;
  // offline.html is precached separately — don't double-cache via fetch.
  if (p === '/offline.html') return false;
  return true;
}

export function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|ico|map)(\?|$)/.test(url.pathname);
}

// ─── IndexedDB operations (non-throwing, fire-and-forget) ─────────

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
  } catch { /* non-blocking */ }
}

export async function getActiveUser() {
  try {
    const db = await openDB();
    const result = await asPromise(storeReq(db, STORES.META, 'readonly').get('activeUser'));
    db.close();
    return result?.value || null;
  } catch { return null; }
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
  } catch { /* non-blocking */ }
}

export async function saveGatheringSnapshot(userId, gatheringId, role, { gathering, members }) {
  if (!userId || !gatheringId) return;
  try {
    const db = await openDB();
    const now = Date.now();
    await asPromise(storeReq(db, STORES.GATHERINGS, 'readwrite').put({
      id: snapshotKey(userId, gatheringId),
      userId, gatheringId,
      gathering: extractGatheringMeta(gathering),
      role: role || 'member',
      members: (members || []).map(extractMinimalMember).filter(Boolean),
      snapshotAt: now,
      expiresAt: now + TTL_MS,
    }));
    db.close();
  } catch { /* non-blocking */ }
}

export async function saveJourneyItems(userId, gatheringId, items) {
  if (!userId || !gatheringId) return;
  try {
    const db = await openDB();
    const now = Date.now();
    await asPromise(storeReq(db, STORES.JOURNEY, 'readwrite').put({
      id: snapshotKey(userId, gatheringId),
      userId, gatheringId,
      items: (items || []).map(extractJourneyItem).filter(Boolean),
      snapshotAt: now,
      expiresAt: now + TTL_MS,
    }));
    db.close();
  } catch { /* non-blocking */ }
}

export async function saveExpenses(userId, gatheringId, role, expenses) {
  if (!userId || !gatheringId) return;
  if (!shouldStoreExpenses(role)) return; // NEVER store for viewer
  try {
    const db = await openDB();
    const now = Date.now();
    await asPromise(storeReq(db, STORES.EXPENSES, 'readwrite').put({
      id: snapshotKey(userId, gatheringId),
      userId, gatheringId,
      expenses: (expenses || []).map(extractExpense).filter(Boolean),
      snapshotAt: now,
      expiresAt: now + TTL_MS,
    }));
    db.close();
  } catch { /* non-blocking */ }
}

export async function getGatheringsForUser(userId) {
  if (!userId) return [];
  try {
    const db = await openDB();
    const now = Date.now();
    const all = await asPromise(storeReq(db, STORES.GATHERINGS, 'readonly').getAll(userRange(userId)));
    db.close();
    return (all || []).filter((e) => !isExpired(e, now));
  } catch { return []; }
}

export async function getGatheringSnapshot(userId, gatheringId) {
  if (!userId || !gatheringId) return null;
  try {
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
      journeySnapshotAt: j?.snapshotAt || null,
      expenses: (ex && !isExpired(ex, now)) ? ex.expenses : null,
      expensesSnapshotAt: ex?.snapshotAt || null,
    };
  } catch { return null; }
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
  } catch { /* non-blocking */ }
}

export { TTL_MS, STORES };