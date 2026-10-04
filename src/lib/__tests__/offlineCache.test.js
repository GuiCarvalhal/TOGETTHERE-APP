import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  snapshotKey, isExpired, isValidRole, shouldStoreExpenses, shouldPruneCache,
  shouldCacheUrl, isStaticAsset,
  extractGatheringMeta, extractMinimalMember, extractJourneyItem, extractExpense,
  setActiveUser, getActiveUser, purgeAll, saveGatheringSnapshot, saveJourneyItems,
  saveExpenses, deleteExpenses, getGatheringsForUser, getGatheringSnapshot, pruneExpired,
  purgeOnAuthError, TTL_MS, MAX_GATHERINGS, MAX_ITEMS,
} from '@/lib/offlineCache';
import { getOfflineSaveStatus, clearOfflineSaveError } from '@/lib/offlineSaveStatus';

// ─── Mock IndexedDB ──────────────────────────────────────────────
function createMockDB() {
  const data = {};
  const db = {
    objectStoreNames: { contains: (n) => n in data },
    createObjectStore: (n) => { if (!(n in data)) data[n] = {}; return createMockStore(data[n]); },
    transaction: (store, mode) => ({
      objectStore: () => createMockStore(data[store] || (data[store] = {})),
    }),
    close: () => {},
  };
  return { db, data };
}
function createMockStore(store) {
  function inRange(key, range) {
    if (!range || !range.lower) return true;
    return key >= range.lower && key <= range.upper;
  }
  function mockReq(result) {
    const req = { result, error: null, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
  return {
    get: (key) => mockReq(store[key]),
    put: (val) => { store[val.id || val.key] = val; return mockReq(val); },
    getAll: (range) => mockReq(Object.values(store).filter((v) => !range || inRange(v.id, range))),
    delete: (keyOrRange) => {
      if (keyOrRange && keyOrRange.lower) {
        Object.keys(store).forEach((k) => { if (inRange(k, keyOrRange)) delete store[k]; });
      } else { delete store[keyOrRange]; }
      return mockReq(undefined);
    },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); return mockReq(undefined); },
  };
}

let mock;
beforeEach(() => {
  mock = createMockDB();
  clearOfflineSaveError();
  globalThis.indexedDB = {
    open: () => {
      const req = { onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: mock.db } });
        if (req.onsuccess) req.onsuccess({ target: { result: mock.db } });
      }, 0);
      return req;
    },
  };
  globalThis.IDBKeyRange = { bound: (lower, upper) => ({ lower, upper }) };
});
afterEach(() => {
  delete globalThis.indexedDB;
  delete globalThis.IDBKeyRange;
});

// ─── Pure logic tests ────────────────────────────────────────────
describe('offlineCache pure logic', () => {
  describe('snapshotKey', () => {
    it('builds userId:gatheringId key', () => {
      expect(snapshotKey('u1', 'g1')).toBe('u1:g1');
    });
  });

  describe('isExpired', () => {
    it('returns true for entries past TTL', () => {
      const now = 1000000;
      expect(isExpired({ expiresAt: now - 1 }, now)).toBe(true);
    });
    it('returns false for entries within TTL', () => {
      const now = 1000000;
      expect(isExpired({ expiresAt: now + TTL_MS }, now)).toBe(false);
    });
    it('returns true for null/missing entries', () => {
      expect(isExpired(null)).toBe(true);
      expect(isExpired({})).toBe(true);
    });
  });

  describe('isValidRole', () => {
    it('accepts owner, admin, member, viewer', () => {
      expect(isValidRole('owner')).toBe(true);
      expect(isValidRole('admin')).toBe(true);
      expect(isValidRole('member')).toBe(true);
      expect(isValidRole('viewer')).toBe(true);
    });
    it('rejects null, undefined, unknown', () => {
      expect(isValidRole(null)).toBe(false);
      expect(isValidRole(undefined)).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole('superadmin')).toBe(false);
    });
  });

  describe('shouldStoreExpenses', () => {
    it('returns true for owner, admin, member', () => {
      expect(shouldStoreExpenses('owner')).toBe(true);
      expect(shouldStoreExpenses('admin')).toBe(true);
      expect(shouldStoreExpenses('member')).toBe(true);
    });
    it('returns false for viewer', () => {
      expect(shouldStoreExpenses('viewer')).toBe(false);
    });
    it('rejects null/undefined/unknown — never defaults to member', () => {
      expect(shouldStoreExpenses(null)).toBe(false);
      expect(shouldStoreExpenses(undefined)).toBe(false);
      expect(shouldStoreExpenses('')).toBe(false);
      expect(shouldStoreExpenses('superadmin')).toBe(false);
    });
  });

  describe('shouldPruneCache (SW cache prune policy)', () => {
    it('prunes tt-shell-* caches', () => {
      expect(shouldPruneCache('tt-shell-v1')).toBe(true);
      expect(shouldPruneCache('tt-shell-v2')).toBe(true);
      expect(shouldPruneCache('tt-shell-old')).toBe(true);
    });
    it('keeps OneSignal and unrelated caches', () => {
      expect(shouldPruneCache('onesignal-cache')).toBe(false);
      expect(shouldPruneCache('workbox-precache-v2')).toBe(false);
      expect(shouldPruneCache('my-custom-cache')).toBe(false);
      expect(shouldPruneCache(null)).toBe(false);
      expect(shouldPruneCache(undefined)).toBe(false);
      expect(shouldPruneCache(123)).toBe(false);
    });
  });

  describe('shouldCacheUrl (SW allowlist)', () => {
    const origin = 'https://togethere.app';
    it('allows /assets/ paths', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/app.js'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/style.css'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/chunk-abc.js'), 'GET', origin)).toBe(true);
    });
    it('allows exact public files', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/icon.svg'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/manifest.json'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/offline-shell.js'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/offline-shell.css'), 'GET', origin)).toBe(true);
    });
    it('rejects non-GET methods', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/app.js'), 'POST', origin)).toBe(false);
    });
    it('rejects cross-origin requests', () => {
      expect(shouldCacheUrl(new URL('https://maps.googleapis.com/map.js'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://cdn.onesignal.com/sdk.js'), 'GET', origin)).toBe(false);
    });
    it('rejects /functions/ paths (backend API)', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/functions/createExpense'), 'GET', origin)).toBe(false);
    });
    it('rejects /api/ paths', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/api/entities'), 'GET', origin)).toBe(false);
    });
    it('rejects auth routes', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/login'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/register'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/forgot-password'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/reset-password'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/auth/callback'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/callback'), 'GET', origin)).toBe(false);
    });
    it('rejects files/uploads/receipts', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/files/abc.pdf'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/uploads/img.png'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/receipts/123.png'), 'GET', origin)).toBe(false);
    });
    it('rejects URLs with auth query tokens', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/?token=abc'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/?code=abc'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/reset-password?reset_token=abc'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/?access_token=abc'), 'GET', origin)).toBe(false);
    });
    it('rejects /offline.html (synthetic SW response)', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/offline.html'), 'GET', origin)).toBe(false);
    });
    it('rejects arbitrary same-origin paths not in allowlist', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/some/random.js'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/data.json'), 'GET', origin)).toBe(false);
      expect(shouldCacheUrl(new URL('https://togethere.app/profile'), 'GET', origin)).toBe(false);
    });
  });

  describe('isStaticAsset', () => {
    it('detects static asset extensions', () => {
      expect(isStaticAsset(new URL('https://togethere.app/a.js'))).toBe(true);
      expect(isStaticAsset(new URL('https://togethere.app/a.css'))).toBe(true);
      expect(isStaticAsset(new URL('https://togethere.app/a.png?v=1'))).toBe(true);
      expect(isStaticAsset(new URL('https://togethere.app/data.json'))).toBe(false);
    });
  });

  describe('extractGatheringMeta', () => {
    it('extracts minimal fields only', () => {
      const g = { name: 'Sardinia', cover_image: 'url', destinations: ['Cagliari'], destination_places: [{ name: 'Cagliari', lat: 1, lng: 2 }], owner_user_id: 'u1', member_user_ids: ['u1'] };
      const meta = extractGatheringMeta(g);
      expect(meta.name).toBe('Sardinia');
      expect(meta.cover_image).toBe('url');
      expect(meta.destinations).toEqual(['Cagliari']);
      expect(meta.destination_places[0].name).toBe('Cagliari');
      expect(meta.owner_user_id).toBeUndefined();
    });
    it('returns null for null input', () => {
      expect(extractGatheringMeta(null)).toBeNull();
    });
  });

  describe('extractMinimalMember', () => {
    it('keeps id for expense payer_member_id lookup', () => {
      const m = { id: 'mem-123', user_id: 'u1', full_name: 'Alice', role: 'member', photo: 'url' };
      const extracted = extractMinimalMember(m);
      expect(extracted.id).toBe('mem-123');
      expect(extracted.user_id).toBe('u1');
      expect(extracted.full_name).toBe('Alice');
      expect(extracted.role).toBe('member');
    });
    it('returns null for null input', () => {
      expect(extractMinimalMember(null)).toBeNull();
    });
  });

  describe('extractJourneyItem (full journey persistence)', () => {
    it('preserves notes, places, airline, attendees', () => {
      const item = {
        id: 'i1', type: 'flight', title: 'BA208',
        start_datetime: '2026-06-27T11:15:00Z',
        end_datetime: '2026-06-27T14:30:00Z',
        location_from: 'LHR', location_to: 'CAG',
        confirmation_number: 'BA208', airline: 'British Airways',
        notes: 'Seat 23A, window',
        from_place: { name: 'LHR', city: 'London', tz: 'Europe/London', iata: 'LHR' },
        to_place: { name: 'CAG', city: 'Cagliari', tz: 'Europe/Rome', iata: 'CAG' },
        place: null,
        attendee_user_ids: ['u1', 'u2'],
        owner_id: 'u1',
      };
      const extracted = extractJourneyItem(item);
      expect(extracted.id).toBe('i1');
      expect(extracted.title).toBe('BA208');
      expect(extracted.airline).toBe('British Airways');
      expect(extracted.notes).toBe('Seat 23A, window');
      expect(extracted.from_place.tz).toBe('Europe/London');
      expect(extracted.to_place.iata).toBe('CAG');
      expect(extracted.attendee_user_ids).toEqual(['u1', 'u2']);
      expect(extracted.confirmation_number).toBe('BA208');
    });
  });

  describe('extractExpense', () => {
    it('preserves original currency, no FX conversion', () => {
      const e = { id: 'e1', title: 'Dinner', amount: 120.50, currency: 'EUR', payer_member_id: 'm1', category: 'food', date: '2026-06-27', notes: 'Great pasta', settled: false };
      const extracted = extractExpense(e);
      expect(extracted.amount).toBe(120.5);
      expect(extracted.currency).toBe('EUR');
      expect(extracted.category).toBe('food');
      expect(extracted.settled).toBe(false);
      expect(extracted.payer_member_id).toBe('m1');
    });
  });
});

// ─── IndexedDB operation tests ────────────────────────────────────
describe('offlineCache IndexedDB operations', () => {
  it('TTL: expired entries are not returned by getGatheringsForUser', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip A' }, members: [] });
    mock.data.gatherings['u1:g1'].expiresAt = Date.now() - 1;
    const result = await getGatheringsForUser('u1');
    expect(result).toEqual([]);
  });

  it('per-user isolation: user A cannot read user B data', async () => {
    await saveGatheringSnapshot('userA', 'g1', 'member', { gathering: { name: 'Alice Trip' }, members: [] });
    await saveGatheringSnapshot('userB', 'g2', 'member', { gathering: { name: 'Bob Trip' }, members: [] });
    const aTrips = await getGatheringsForUser('userA');
    const bTrips = await getGatheringsForUser('userB');
    expect(aTrips).toHaveLength(1);
    expect(aTrips[0].gathering.name).toBe('Alice Trip');
    expect(bTrips).toHaveLength(1);
    expect(bTrips[0].gathering.name).toBe('Bob Trip');
  });

  it('viewer expenses exclusion: saveExpenses refuses for viewer role', async () => {
    await saveExpenses('u1', 'g1', 'viewer', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    expect(mock.data.expenses?.['u1:g1']).toBeUndefined();
  });

  it('viewer demotion: saveExpenses with viewer DELETES existing expense snapshot', async () => {
    // First save as member — stores expenses
    await saveExpenses('u1', 'g1', 'member', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    expect(mock.data.expenses['u1:g1']).toBeDefined();
    expect(mock.data.expenses['u1:g1'].expenses).toHaveLength(1);
    // Then role changes to viewer — must DELETE the existing snapshot
    const result = await saveExpenses('u1', 'g1', 'viewer', [{ id: 'e2', title: 'Lunch', amount: 30, currency: 'USD' }]);
    expect(result.ok).toBe(true);
    expect(result.deleted).toBe(true);
    expect(mock.data.expenses['u1:g1']).toBeUndefined();
  });

  it('viewer expenses exclusion: getGatheringSnapshot returns null expenses for viewer', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'viewer', { gathering: { name: 'Viewer Trip' }, members: [] });
    await saveExpenses('u1', 'g1', 'viewer', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    const snap = await getGatheringSnapshot('u1', 'g1');
    expect(snap.role).toBe('viewer');
    expect(snap.expenses).toBeNull();
  });

  it('rejects unknown/null role: saveGatheringSnapshot returns invalid-role', async () => {
    const r1 = await saveGatheringSnapshot('u1', 'g1', null, { gathering: { name: 'X' }, members: [] });
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe('invalid-role');
    const r2 = await saveGatheringSnapshot('u1', 'g1', 'superadmin', { gathering: { name: 'X' }, members: [] });
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('invalid-role');
    expect(mock.data.gatherings?.['u1:g1']).toBeUndefined();
  });

  it('logout purge: purgeAll clears all stores', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members: [] });
    await saveJourneyItems('u1', 'g1', [{ id: 'i1', type: 'flight', title: 'BA208' }]);
    await saveExpenses('u1', 'g1', 'member', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    await setActiveUser('u1');
    expect(Object.keys(mock.data.gatherings)).toHaveLength(1);
    expect(Object.keys(mock.data.journey)).toHaveLength(1);
    expect(Object.keys(mock.data.expenses)).toHaveLength(1);
    expect(mock.data.meta.activeUser).toBeDefined();
    await purgeAll();
    expect(Object.keys(mock.data.gatherings)).toHaveLength(0);
    expect(Object.keys(mock.data.journey)).toHaveLength(0);
    expect(Object.keys(mock.data.expenses)).toHaveLength(0);
    expect(Object.keys(mock.data.meta)).toHaveLength(0);
  });

  it('account switch: setActiveUser purges previous user data', async () => {
    await setActiveUser('userA');
    await saveGatheringSnapshot('userA', 'g1', 'member', { gathering: { name: 'Alice Trip' }, members: [] });
    expect(Object.keys(mock.data.gatherings)).toHaveLength(1);
    await setActiveUser('userB');
    expect(mock.data.gatherings['userA:g1']).toBeUndefined();
    expect(mock.data.meta.activeUser.value).toBe('userB');
  });

  it('marker/account race: save aborts when active user changed', async () => {
    await setActiveUser('userA');
    // userA is no longer active (switched to userB)
    await setActiveUser('userB');
    // Late save for userA should abort — userB is now active
    const result = await saveGatheringSnapshot('userA', 'g1', 'member', { gathering: { name: 'Alice Late' }, members: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('user-changed');
    expect(mock.data.gatherings['userA:g1']).toBeUndefined();
  });

  it('marker/account race: save proceeds for current active user', async () => {
    await setActiveUser('userB');
    const result = await saveGatheringSnapshot('userB', 'g1', 'member', { gathering: { name: 'Bob Trip' }, members: [] });
    expect(result.ok).toBe(true);
    expect(mock.data.gatherings['userB:g1']).toBeDefined();
  });

  it('IDB failure surfacing: save returns ok:false and reports error', async () => {
    // Make indexedDB.open fail
    delete globalThis.indexedDB;
    globalThis.indexedDB = { open: () => { const r = {}; setTimeout(() => { if (r.onerror) r.onerror({ target: { error: new Error('QuotaExceeded') } }); }); return r; } };
    const result = await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'X' }, members: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    // Error status should be surfaced
    expect(getOfflineSaveStatus().status).toBe('error');
  });

  it('reads distinguish no data vs cache unavailable', async () => {
    // No saved data — returns empty array (no throw)
    const result = await getGatheringsForUser('u1');
    expect(result).toEqual([]);
    // IDB unavailable — throws
    delete globalThis.indexedDB;
    await expect(getGatheringsForUser('u1')).rejects.toThrow();
  });

  it('payer-name lookup: member.id preserved for expense payer resolution', async () => {
    const members = [
      { id: 'mem-1', user_id: 'u1', full_name: 'Alice', role: 'member' },
      { id: 'mem-2', user_id: 'u2', full_name: 'Bob', role: 'member' },
    ];
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members });
    await saveExpenses('u1', 'g1', 'member', [
      { id: 'e1', title: 'Dinner', amount: 50, currency: 'USD', payer_member_id: 'mem-2' },
    ]);
    const snap = await getGatheringSnapshot('u1', 'g1');
    const payer = snap.members.find((m) => m.id === 'mem-2');
    expect(payer).toBeDefined();
    expect(payer.full_name).toBe('Bob');
    const exp = snap.expenses.find((e) => e.payer_member_id === 'mem-2');
    expect(exp).toBeDefined();
  });

  it('full journey persistence: notes/places/airline/attendees saved', async () => {
    await setActiveUser('u1');
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members: [] });
    const items = [{
      id: 'i1', type: 'flight', title: 'BA208',
      start_datetime: '2026-06-27T11:15:00Z',
      airline: 'British Airways', notes: 'Window seat',
      from_place: { name: 'LHR', city: 'London', tz: 'Europe/London', iata: 'LHR' },
      to_place: { name: 'CAG', city: 'Cagliari', tz: 'Europe/Rome', iata: 'CAG' },
      attendee_user_ids: ['u1', 'u2'],
    }];
    await saveJourneyItems('u1', 'g1', items);
    const snap = await getGatheringSnapshot('u1', 'g1');
    expect(snap.journeyItems).toHaveLength(1);
    expect(snap.journeyItems[0].airline).toBe('British Airways');
    expect(snap.journeyItems[0].notes).toBe('Window seat');
    expect(snap.journeyItems[0].from_place.iata).toBe('LHR');
    expect(snap.journeyItems[0].to_place.tz).toBe('Europe/Rome');
    expect(snap.journeyItems[0].attendee_user_ids).toEqual(['u1', 'u2']);
    expect(snap.journeySnapshotAt).toBeTruthy();
  });

  it('per-dataset timestamps: journey and expenses have separate snapshotAt', async () => {
    await setActiveUser('u1');
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members: [] });
    await saveJourneyItems('u1', 'g1', [{ id: 'i1', type: 'flight', title: 'BA208' }]);
    await saveExpenses('u1', 'g1', 'member', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    const snap = await getGatheringSnapshot('u1', 'g1');
    expect(snap.snapshotAt).toBeTruthy();
    expect(snap.journeySnapshotAt).toBeTruthy();
    expect(snap.expensesSnapshotAt).toBeTruthy();
    // They may differ by a few ms — all should be valid timestamps
    expect(typeof snap.snapshotAt).toBe('number');
    expect(typeof snap.journeySnapshotAt).toBe('number');
    expect(typeof snap.expensesSnapshotAt).toBe('number');
  });

  it('pruneExpired removes only expired entries', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Fresh' }, members: [] });
    await saveGatheringSnapshot('u1', 'g2', 'member', { gathering: { name: 'Stale' }, members: [] });
    mock.data.gatherings['u1:g2'].expiresAt = Date.now() - 1;
    await pruneExpired();
    const result = await getGatheringsForUser('u1');
    expect(result).toHaveLength(1);
    expect(result[0].gathering.name).toBe('Fresh');
  });

  it('getGatheringSnapshot returns null for expired gathering', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members: [] });
    mock.data.gatherings['u1:g1'].expiresAt = Date.now() - 1;
    const snap = await getGatheringSnapshot('u1', 'g1');
    expect(snap).toBeNull();
  });

  it('purgeOnAuthError purges on 401/403, not on network error', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip' }, members: [] });
    expect(Object.keys(mock.data.gatherings)).toHaveLength(1);
    // 401 → purge
    expect(purgeOnAuthError({ status: 401 })).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(Object.keys(mock.data.gatherings)).toHaveLength(0);
    // Re-save, then test 403
    await saveGatheringSnapshot('u1', 'g2', 'member', { gathering: { name: 'Trip2' }, members: [] });
    expect(purgeOnAuthError({ status: 403 })).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(Object.keys(mock.data.gatherings)).toHaveLength(0);
    // Network error (no status) → no purge
    await saveGatheringSnapshot('u1', 'g3', 'member', { gathering: { name: 'Trip3' }, members: [] });
    expect(purgeOnAuthError({ message: 'Network error' })).toBe(false);
    expect(Object.keys(mock.data.gatherings)).toHaveLength(1);
  });

  it('gathering count bound: prunes oldest when exceeding MAX_GATHERINGS', async () => {
    await setActiveUser('u1');
    for (let i = 0; i < MAX_GATHERINGS + 3; i++) {
      await saveGatheringSnapshot('u1', `g${i}`, 'member', { gathering: { name: `Trip ${i}` }, members: [] });
    }
    const result = await getGatheringsForUser('u1');
    expect(result.length).toBeLessThanOrEqual(MAX_GATHERINGS);
  });

  it('deleteExpenses removes expense snapshot', async () => {
    await setActiveUser('u1');
    await saveExpenses('u1', 'g1', 'member', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    expect(mock.data.expenses['u1:g1']).toBeDefined();
    await deleteExpenses('u1', 'g1');
    expect(mock.data.expenses['u1:g1']).toBeUndefined();
  });
});