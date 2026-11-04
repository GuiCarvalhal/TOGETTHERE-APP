import { base44 } from '@/api/base44Client';

// Shared journey-inbox count so the global header badge and the Journey Inbox
// page can never disagree. The inbox page pushes the exact number after every
// file / dismiss; the header only re-reads from the server when its value is
// older than maxAgeMs, so navigating between pages doesn't re-query each time.
let count = 0;
let lastFetchedAt = 0;
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn(count));
}

export function subscribeInboxCount(fn) {
  listeners.add(fn);
  fn(count);
  return () => listeners.delete(fn);
}

export function setInboxCount(n) {
  count = Math.max(0, Number(n) || 0);
  lastFetchedAt = Date.now();
  emit();
}

export async function refreshInboxCount({ maxAgeMs = 60000 } = {}) {
  if (Date.now() - lastFetchedAt < maxAgeMs) {
    emit();
    return count;
  }
  // Stamp before the request so a burst of page mounts can't fire several calls.
  lastFetchedAt = Date.now();
  try {
    const res = await base44.functions.invoke('getJourneyInbox', {});
    count = ((res.data || res)?.items || []).length;
  } catch {
    /* keep the last known count */
  }
  emit();
  return count;
}