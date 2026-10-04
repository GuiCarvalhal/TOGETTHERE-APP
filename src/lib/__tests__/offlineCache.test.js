import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  snapshotKey, isExpired, shouldStoreExpenses, shouldCacheUrl, isStaticAsset,
  extractGatheringMeta, extractMinimalMember, extractJourneyItem, extractExpense,
  setActiveUser, getActiveUser, purgeAll, saveGatheringSnapshot, saveJourneyItems,
  saveExpenses, getGatheringsForUser, getGatheringSnapshot, pruneExpired, TTL_MS,
} from '@/lib/offlineCache';

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

  describe('shouldStoreExpenses', () => {
    it('returns true for owner, admin, member', () => {
      expect(shouldStoreExpenses('owner')).toBe(true);
      expect(shouldStoreExpenses('admin')).toBe(true);
      expect(shouldStoreExpenses('member')).toBe(true);
    });
    it('returns false for viewer', () => {
      expect(shouldStoreExpenses('viewer')).toBe(false);
    });
  });

  describe('shouldCacheUrl', () => {
    const origin = 'https://togethere.app';
    it('allows same-origin static assets', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/app.js'), 'GET', origin)).toBe(true);
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/style.css'), 'GET', origin)).toBe(true);
    });
    it('rejects non-GET methods', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/assets/app.js'), 'POST', origin)).toBe(false);
    });
    it('rejects cross-origin requests', () => {
      expect(shouldCacheUrl(new URL('https://maps.googleapis.com/map.js'), 'GET', origin)).toBe(false);
    });
    it('rejects /functions/ paths (backend API)', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/functions/createExpense'), 'GET', origin)).toBe(false);
    });
    it('rejects /api/ paths', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/api/entities'), 'GET', origin)).toBe(false);
    });
    it('rejects /offline.html (precached separately)', () => {
      expect(shouldCacheUrl(new URL('https://togethere.app/offline.html'), 'GET', origin)).toBe(false);
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

  describe('extractJourneyItem', () => {
    it('preserves place timezone for offline display', () => {
      const item = { id: 'i1', type: 'flight', title: 'BA208', start_datetime: '2026-06-27T11:15:00Z', from_place: { name: 'LHR', city: 'London', tz: 'Europe/London', iata: 'LHR' }, to_place: { name: 'CAG', city: 'Cagliari', tz: 'Europe/Rome', iata: 'CAG' }, attendee_user_ids: ['u1', 'u2'] };
      const extracted = extractJourneyItem(item);
      expect(extracted.from_place.tz).toBe('Europe/London');
      expect(extracted.to_place.tz).toBe('Europe/Rome');
      expect(extracted.from_place.iata).toBe('LHR');
      expect(extracted.attendee_user_ids).toEqual(['u1', 'u2']);
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
    });
  });
});

// ─── IndexedDB operation tests ────────────────────────────────────
describe('offlineCache IndexedDB operations', () => {
  it('TTL: expired entries are not returned by getGatheringsForUser', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'member', { gathering: { name: 'Trip A' }, members: [] });
    // Manually expire the entry
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
    // Expenses store should not contain any entry for viewer (store may not
    // even be created since saveExpenses returns before opening the DB).
    expect(mock.data.expenses?.['u1:g1']).toBeUndefined();
  });

  it('viewer expenses exclusion: getGatheringSnapshot returns null expenses for viewer', async () => {
    await saveGatheringSnapshot('u1', 'g1', 'viewer', { gathering: { name: 'Viewer Trip' }, members: [] });
    await saveExpenses('u1', 'g1', 'viewer', [{ id: 'e1', title: 'Dinner', amount: 50, currency: 'USD' }]);
    const snap = await getGatheringSnapshot('u1', 'g1');
    expect(snap.role).toBe('viewer');
    expect(snap.expenses).toBeNull();
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
    // userA data should be purged
    expect(mock.data.gatherings['userA:g1']).toBeUndefined();
    expect(mock.data.meta.activeUser.value).toBe('userB');
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
});