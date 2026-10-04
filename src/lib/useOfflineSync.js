import { useEffect } from 'react';
import {
  saveGatheringSnapshot, saveJourneyItems, saveExpenses, pruneExpired, purgeAll,
} from '@/lib/offlineCache';
import { clearOfflineSaveError } from '@/lib/offlineSaveStatus';

// Populates the offline IndexedDB cache from data the authenticated user has
// already successfully retrieved online. Saves are non-blocking but errors
// are surfaced via setOfflineSaveError (never silently swallowed). Only fires
// after a successful (non-error, non-loading) load — auth/network errors never
// produce a stale cache entry. On authoritative 401/403, purges all snapshots.

// Call from GatheringShell after gathering CONTEXT loads successfully.
// Saves gathering meta + members only. Journey items are saved separately by
// useOfflineJourneyCache (the context's journeyItems are minimal date-range
// projections, not the full data the Journey page loads).
export function useOfflineGatheringCache({ userId, gatheringId, role, gathering, members, error, loading }) {
  useEffect(() => {
    if (purgeOnAuthError(error)) return;
    if (error || loading || !userId || !gatheringId || !gathering) return;
    saveGatheringSnapshot(userId, gatheringId, role, { gathering, members }).then((r) => {
      if (r?.ok) clearOfflineSaveError();
    });
  }, [userId, gatheringId, role, gathering, members, error, loading]);
}

// Call from GatheringJourney after the FULL journey items load successfully.
// This saves the complete item data (title, notes, places, airline, attendees)
// — not the context's minimal date-range projection.
export function useOfflineJourneyCache({ userId, gatheringId, role, items, error, loading }) {
  useEffect(() => {
    if (purgeOnAuthError(error)) return;
    if (error || loading || !userId || !gatheringId) return;
    saveJourneyItems(userId, gatheringId, items || []).then((r) => {
      if (r?.ok) clearOfflineSaveError();
    });
  }, [userId, gatheringId, role, items, error, loading]);
}

// Call from useExpensesData after expenses load successfully.
// For viewer role, saveExpenses DELETES any previously stored expense snapshot
// (demotion purge) — it never stores. Rejects unknown/null roles.
export function useOfflineExpensesCache({ userId, gatheringId, role, expenses, error, loading }) {
  useEffect(() => {
    if (purgeOnAuthError(error)) return;
    if (error || loading || !userId || !gatheringId) return;
    saveExpenses(userId, gatheringId, role, expenses || []).then((r) => {
      if (r?.ok) clearOfflineSaveError();
    });
  }, [userId, gatheringId, role, expenses, error, loading]);
}

// Opportunistic pruning — call once on app mount to evict expired entries.
export function useOfflinePruneOnMount() {
  useEffect(() => { pruneExpired().catch(() => {}); }, []);
}

// Shared auth-error purge — purges all snapshots on authoritative 401/403.
// Transient network failures (no status) never trigger a purge.
function purgeOnAuthError(error) {
  if (error && (error.status === 401 || error.status === 403)) {
    purgeAll().catch(() => {});
    return true;
  }
  return false;
}