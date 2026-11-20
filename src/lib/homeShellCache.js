// Shell cache for Home: the last successful payload, painted synchronously on a
// return visit so trips appear before the network answers. The network stays the
// source of truth — this only removes the empty first frame.
//
// It is INVALIDATED (not patched) whenever the featured NOW/NEXT could have
// changed from somewhere else: deleting or restoring a journey segment, or a
// gathering. A stale shell would otherwise paint a segment that no longer exists
// until the fresh payload landed.
export const SHELL_KEY = 'tt-home-shell-v1';
export const SHELL_TTL = 2 * 60 * 1000;

export function readHomeShell(userId) {
  if (!userId) return null;
  try {
    const raw = sessionStorage.getItem(SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId) return null;
    if (Date.now() - parsed.at > SHELL_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeHomeShell(userId, data) {
  if (!userId) return;
  try {
    sessionStorage.setItem(SHELL_KEY, JSON.stringify({ at: Date.now(), userId, data }));
  } catch { /* ignore */ }
}

export function invalidateHomeShell() {
  try { sessionStorage.removeItem(SHELL_KEY); } catch { /* ignore */ }
}