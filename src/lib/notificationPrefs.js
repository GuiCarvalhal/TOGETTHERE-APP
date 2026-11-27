// Pure helpers for the account-wide notification preferences.
//
// Preferences live on the user's membership in EVERY gathering, so the account
// screen has to merge every membership row that is theirs before it can show a
// single switch. Rows can be keyed by user id, or only by email while an invite
// is still unclaimed, and both shapes belong to the same person.

export const NOTIFY_KEYS = [
  'notify_master',
  'notify_journey',
  'notify_expenses',
  'notify_members',
  'notify_reminders',
  'notify_ai',
];

export const NOTIFY_DEFAULTS = NOTIFY_KEYS.reduce((acc, key) => {
  acc[key] = true;
  return acc;
}, {});

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// A row is this user's when it carries their user id, or when it is still an
// unclaimed placeholder that carries their email. A row already claimed by
// somebody else is never matched by email.
export function rowBelongsToUser(row, userId, email) {
  if (!row) return false;
  const uid = typeof row.user_id === 'string' ? row.user_id : '';
  if (uid && uid === userId) return true;
  if (uid && !uid.startsWith('pending-')) return false;
  const mail = normalizeEmail(email);
  return Boolean(mail) && normalizeEmail(row.email) === mail;
}

export function mergeMemberships({ byId = [], byEmail = [] } = {}, userId, email) {
  const seen = new Set();
  const rows = [];
  for (const row of [...(byId || []), ...(byEmail || [])]) {
    if (!row?.id || seen.has(row.id)) continue;
    if (!rowBelongsToUser(row, userId, email)) continue;
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

// A category is ON only when it is ON in every membership: the account switch
// promises to apply to all of them. An absent value counts as ON (the default).
export function aggregatePrefs(rows) {
  const next = { ...NOTIFY_DEFAULTS };
  if (!rows || !rows.length) return next;
  for (const key of NOTIFY_KEYS) {
    next[key] = rows.every((row) => row?.[key] !== false);
  }
  return next;
}

// Master off locks the category switches: turning a category on while all
// notifications are off would have no effect, so it is disabled instead.
export function categoryLocked(prefs) {
  return !prefs || prefs.notify_master !== true;
}

export function isSwitchOn(prefs, key) {
  if (!prefs) return false;
  if (key === 'notify_master') return prefs.notify_master === true;
  return prefs.notify_master === true && prefs[key] === true;
}

// Optimistic update that also hands back what to restore on failure.
export function beginToggle(prefs, key, value) {
  const previous = prefs ? prefs[key] : undefined;
  return { next: { ...(prefs || NOTIFY_DEFAULTS), [key]: value }, previous };
}

export function revertToggle(prefs, key, previous) {
  const next = { ...(prefs || {}) };
  if (previous === undefined) delete next[key];
  else next[key] = previous;
  return next;
}