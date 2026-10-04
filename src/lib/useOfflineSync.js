import { useEffect } from 'react';
import {
  saveGatheringSnapshot, saveJourneyItems, saveExpenses, pruneExpired,
} from '@/lib/offlineCache';

// Populates the offline IndexedDB cache from data the authenticated user has
// already successfully retrieved online. All saves are non-throwing and
// fire-and-forget — cache errors never block the live app. Only fires after a
// successful (non-error, non-loading) load, so auth/network errors never
// produce a stale cache entry.

// Call from GatheringShell after gathering context loads successfully.
// Saves gathering meta + members + the context's journey items.
export function useOfflineGatheringCache({ userId, gatheringId, role, gathering, members, journeyItems, error, loading }) {
  useEffect(() => {
    if (error || loading || !userId || !gatheringId || !gathering) return;
    saveGatheringSnapshot(userId, gatheringId, role, { gathering, members }).catch(() => {});
    saveJourneyItems(userId, gatheringId, journeyItems || []).catch(() => {});
  }, [userId, gatheringId, role, gathering, members, journeyItems, error, loading]);
}

// Call from useExpensesData after expenses load successfully.
// NEVER stores for viewer role (shouldStoreExpenses guard inside saveExpenses).
export function useOfflineExpensesCache({ userId, gatheringId, role, expenses, error, loading }) {
  useEffect(() => {
    if (error || loading || !userId || !gatheringId) return;
    saveExpenses(userId, gatheringId, role, expenses || []).catch(() => {});
  }, [userId, gatheringId, role, expenses, error, loading]);
}

// Opportunistic pruning — call once on app mount to evict expired entries.
export function useOfflinePruneOnMount() {
  useEffect(() => { pruneExpired().catch(() => {}); }, []);
}