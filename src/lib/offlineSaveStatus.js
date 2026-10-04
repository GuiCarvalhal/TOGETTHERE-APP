// Nonblocking offline-save error reporting. Save failures are surfaced to the
// UI as "Offline saving unavailable" instead of being silently swallowed.
// Reads are NOT affected — a save failure never shows cached-success.

let status = 'ok'; // 'ok' | 'error'
let lastError = null;
const listeners = new Set();

export function setOfflineSaveError(error) {
  status = 'error';
  lastError = error || null;
  // eslint-disable-next-line no-console
  console.error('[offline] Save failed:', error);
  listeners.forEach((l) => l(status));
}

export function clearOfflineSaveError() {
  if (status === 'ok') return;
  status = 'ok';
  lastError = null;
  listeners.forEach((l) => l(status));
}

export function getOfflineSaveStatus() {
  return { status, lastError };
}

export function subscribeOfflineSaveStatus(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}