// Home layout preference: which boxes Home shows, and in which order.
// Persisted per user on the User record (home_layout) so it follows the user
// across devices. Everything here is pure, so a missing, partial or legacy value
// always resolves to a complete, valid layout — an unknown box is dropped, a new
// box the user has never seen is appended in its default position, and a user
// with no preference at all gets DEFAULT_HOME_LAYOUT.
export const HOME_BOX_KEYS = ['next', 'gatherings', 'profile', 'imports'];

// Every box visible, in the shipped order.
export const DEFAULT_HOME_LAYOUT = { order: [...HOME_BOX_KEYS], hidden: [] };

const isKnown = (key) => HOME_BOX_KEYS.includes(key);

export function normalizeHomeLayout(raw) {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = null; }
  }
  if (!value || typeof value !== 'object') return { ...DEFAULT_HOME_LAYOUT };

  const seen = new Set();
  const order = [];
  (Array.isArray(value.order) ? value.order : []).forEach((key) => {
    if (isKnown(key) && !seen.has(key)) { seen.add(key); order.push(key); }
  });
  // Boxes added after the user saved a preference keep their default position.
  HOME_BOX_KEYS.forEach((key) => { if (!seen.has(key)) order.push(key); });

  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter((key) => isKnown(key));
  return { order, hidden: [...new Set(hidden)] };
}

export const isBoxVisible = (layout, key) => !normalizeHomeLayout(layout).hidden.includes(key);

// Move one box by `delta` positions (negative = up). Returns a normalized layout;
// moving past either end is a no-op.
export function moveHomeBox(layout, key, delta) {
  const current = normalizeHomeLayout(layout);
  const from = current.order.indexOf(key);
  if (from < 0) return current;
  const to = Math.min(current.order.length - 1, Math.max(0, from + delta));
  if (to === from) return current;
  const order = [...current.order];
  order.splice(to, 0, ...order.splice(from, 1));
  return { ...current, order };
}

export function toggleHomeBox(layout, key) {
  const current = normalizeHomeLayout(layout);
  if (!isKnown(key)) return current;
  const hidden = current.hidden.includes(key)
    ? current.hidden.filter((k) => k !== key)
    : [...current.hidden, key];
  return { ...current, hidden };
}