// Secure OneSignal server helper for TOGETTHERE push notifications.
// Reads secrets ONLY server-side (process.env), validates configuration, and
// sends through the OneSignal REST API. Never throws — returns a structured
// result so a notification failure never breaks the parent action.

const CATEGORY_PREF = {
  journey: 'notify_journey',
  expenses: 'notify_expenses',
  members: 'notify_members',
  reminders: 'notify_reminders',
  ai: 'notify_ai',
};

const DEDUP_WINDOW_MS = 60_000;
const _dedup = new Map();

function getConfig() {
  const restKey = (process.env.OneSignal_Rest_API || '').trim();
  const appId = (process.env.OneSignal_AppID || '').trim();
  return { restKey, appId, configured: Boolean(restKey && appId) };
}

export function isOneSignalConfigured() {
  return getConfig().configured;
}

// Pure predicate: is this member eligible to receive a notification for this
// category? Checks master switch, category preference, and viewer exclusions.
// `includeViewers` defaults true (targeted sends reach a viewer the caller
// explicitly chose); broadcast sends pass false to omit viewers entirely.
export function memberEligibleForCategory(m, { category, prefKey, includeViewers = true }) {
  if (!m) return false;
  if (m.notify_master === false) return false;
  if (prefKey && m[prefKey] === false) return false;
  if (category === 'expenses' && m.role === 'viewer') return false;
  if (!includeViewers && m.role === 'viewer') return false;
  return true;
}

function shouldDedup(key) {
  if (!key) return false;
  const now = Date.now();
  if (_dedup.size > 200) {
    for (const [k, t] of _dedup) if (now - t > DEDUP_WINDOW_MS) _dedup.delete(k);
  }
  const last = _dedup.get(key) || 0;
  if (now - last < DEDUP_WINDOW_MS) return true;
  _dedup.set(key, now);
  return false;
}

// Core send. Targets users by their OneSignal external_id (the Base44 user id).
export async function sendToUsers({ externalUserIds, heading, message, data, dedupKey, url }) {
  const { restKey, appId, configured } = getConfig();
  if (!configured) {
    return { ok: false, error: 'OneSignal is not configured', sent: 0 };
  }
  const ids = (externalUserIds || []).filter(Boolean);
  if (!ids.length) return { ok: true, sent: 0, reason: 'no_recipients' };
  if (shouldDedup(dedupKey)) return { ok: true, sent: 0, reason: 'deduplicated' };

  const body = {
    app_id: appId,
    include_external_user_ids: ids,
    headings: { en: heading || 'TOGETTHERE' },
    contents: { en: message || '' },
    data: data || {},
  };
  if (url) body.url = url;

  try {
    const res = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${restKey}` },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        (json && Array.isArray(json.errors) && json.errors[0]) ||
        (json && json.detail) ||
        (json && json.error) ||
        `OneSignal error (${res.status})`;
      return { ok: false, error: errMsg, sent: 0, status: res.status };
    }
    const sent = typeof json.recipients === 'number' ? json.recipients : ids.length;
    return { ok: true, sent, id: json.id };
  } catch (e) {
    return { ok: false, error: e.message || 'OneSignal request failed', sent: 0 };
  }
}

// Filter a set of user ids by their Member notification preferences for a category.
async function filterByPrefs(base44, gatheringId, userIds, category) {
  if (!userIds.length) return [];
  const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
  const prefKey = CATEGORY_PREF[category];
  const byUid = new Map((members || []).map((m) => [m.user_id, m]));
  return userIds.filter((uid) => memberEligibleForCategory(byUid.get(uid), { category, prefKey }));
}

// Notify specific users (e.g. a join requester, a member whose role changed).
// Respects their notification preferences unless enforcePrefs is false.
export async function notifyUsers(base44, opts) {
  const { gatheringId, userIds, category, heading, message, data, dedupKey, url, enforcePrefs = true } = opts;
  let targets = (userIds || []).filter(Boolean);
  if (enforcePrefs) targets = await filterByPrefs(base44, gatheringId, targets, category);
  return sendToUsers({ externalUserIds: targets, heading, message, data, dedupKey, url });
}

// Broadcast to all eligible members of a gathering for a category.
// Excludes placeholder members (pending-), the actor, and viewers for expenses
// or participant-only events (unless includeViewers is true).
export async function notifyGatheringMembers(base44, opts) {
  const {
    gatheringId, category, excludeUserIds = [], includeViewers = false,
    heading, message, data, dedupKey, url,
  } = opts;
  const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
  const prefKey = CATEGORY_PREF[category];
  const exclude = new Set((excludeUserIds || []).filter(Boolean));
  const targets = (members || [])
    .filter((m) => {
      if (!m.user_id || m.user_id.startsWith('pending-')) return false;
      if (exclude.has(m.user_id)) return false;
      return memberEligibleForCategory(m, { category, prefKey, includeViewers });
    })
    .map((m) => m.user_id);
  return sendToUsers({ externalUserIds: targets, heading, message, data, dedupKey, url });
}