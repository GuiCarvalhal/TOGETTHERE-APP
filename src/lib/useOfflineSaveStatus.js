import { useState, useEffect } from 'react';
import { getOfflineSaveStatus, subscribeOfflineSaveStatus } from '@/lib/offlineSaveStatus';

// React hook subscribing to the offline-save error status. Returns
// { status, lastError } and re-renders when the status changes.
export function useOfflineSaveStatus() {
  const [snap, setSnap] = useState(getOfflineSaveStatus());
  useEffect(() => subscribeOfflineSaveStatus(setSnap), []);
  return snap;
}