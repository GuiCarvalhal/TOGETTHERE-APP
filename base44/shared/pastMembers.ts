// People the current user has shared a gathering with before, resolved to their
// stable app account. Used by the "Add members" surface so a host can add
// previous travel companions without sending an invite link.
//
// A candidate must be a REAL app user: member rows whose user_id is a pending
// placeholder ("pending-<timestamp>", created by the legacy manual add flow) or
// an email address (beta imports stored the email in user_id) are not accounts
// and are dropped. Resolving the User record also gives us the current global
// display name and photo, so the list never shows a stale per-gathering name.

const MAX_CONTACTS = 400;

export function firstNameOf(name, fallback) {
  const base = (name || fallback || '').trim();
  if (!base) return '';
  return base.split(/\s+/)[0];
}

function isStableUserId(uid) {
  const v = (uid || '').trim();
  if (!v) return false;
  if (v.startsWith('pending-')) return false;
  if (v.includes('@')) return false;
  return true;
}

// Deduplicated candidates: one row per user account, newest membership wins for
// any per-gathering fallback fields.
export async function resolvePastContacts(base44, userId) {
  if (!userId) return [];
  const myRows = await base44.asServiceRole.entities.Member.filter({ user_id: userId }).catch(() => []);
  const gatheringIds = [...new Set((myRows || []).map((m) => m.gathering_id).filter(Boolean))];
  if (!gatheringIds.length) return [];

  const rowsByGathering = await Promise.all(
    gatheringIds.map((gid) =>
      base44.asServiceRole.entities.Member.filter({ gathering_id: gid }).catch(() => [])
    )
  );

  const byUid = new Map();
  for (const rows of rowsByGathering) {
    for (const m of rows || []) {
      const uid = (m.user_id || '').trim();
      if (!isStableUserId(uid) || uid === userId) continue;
      // Viewers never took part in the gathering, so they never traveled with you.
      if (m.role === 'viewer') continue;
      const prev = byUid.get(uid);
      if (!prev || (m.created_date || '') > (prev.created_date || '')) {
        byUid.set(uid, {
          user_id: uid,
          created_date: m.created_date || '',
          full_name: m.full_name || '',
          photo: m.photo || '',
          email: (m.email || '').trim(),
        });
      }
    }
  }

  const uids = [...byUid.keys()].slice(0, MAX_CONTACTS);
  if (!uids.length) return [];

  let users = [];
  try {
    const res = await base44.asServiceRole.entities.User.filter({ id: { $in: uids } });
    users = Array.isArray(res) ? res : (res && res.items) || [];
  } catch {
    users = [];
  }
  const userById = new Map();
  for (const u of users) if (u && u.id) userById.set(u.id, u);

  // Accounts that no longer resolve to a User record are inactive/deleted users:
  // they are excluded rather than rendered as nameless rows.
  return uids
    .filter((uid) => userById.has(uid))
    .map((uid) => {
      const u = userById.get(uid);
      const row = byUid.get(uid);
      const name = (u.display_name || u.full_name || row.full_name || '').trim();
      return {
        user_id: uid,
        full_name: name,
        first_name: firstNameOf(name, (u.email || row.email || '').split('@')[0]),
        photo: u.photo || row.photo || '',
        email: (u.email || row.email || '').trim().toLowerCase(),
      };
    });
}

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase();
}

// Idempotent add: re-reads current membership, skips anyone already present (by
// account id OR email, which covers legacy rows), then collapses any duplicate
// rows a concurrent add may have created for the same account.
export async function addPastMembersToGathering(base44, { gatheringId, actorUserId, ownerUid, userIds }) {
  const requested = [...new Set((userIds || []).filter(isStableUserId))].slice(0, 25);
  if (!requested.length) return { added: [], skipped: 0, failed: [] };

  const [contacts, currentMembers] = await Promise.all([
    resolvePastContacts(base44, actorUserId),
    base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }).catch(() => []),
  ]);

  const contactById = new Map((contacts || []).map((c) => [c.user_id, c]));
  const usedUids = new Set((currentMembers || []).map((m) => (m.user_id || '').trim()));
  const usedEmails = new Set((currentMembers || []).map((m) => normalizeEmail(m.email)).filter(Boolean));

  const added = [];
  const failed = [];
  let skipped = 0;

  for (const uid of requested) {
    const contact = contactById.get(uid);
    if (!contact) {
      failed.push({ user_id: uid, name: '', reason: 'not_a_contact' });
      continue;
    }
    if (usedUids.has(uid) || (contact.email && usedEmails.has(contact.email))) {
      skipped += 1;
      continue;
    }
    await base44.asServiceRole.entities.Member.create({
      gathering_id: gatheringId,
      user_id: uid,
      role: 'member',
      full_name: contact.full_name || contact.first_name || 'Traveler',
      email: contact.email || undefined,
      photo: contact.photo || undefined,
      owner_user_id: ownerUid || null,
    });
    usedUids.add(uid);
    if (contact.email) usedEmails.add(contact.email);
    added.push({ user_id: uid, full_name: contact.full_name || contact.first_name });
  }

  await collapseDuplicates(base44, gatheringId);
  return { added, skipped, failed };
}

// Two hosts adding the same person at the same second would otherwise leave two
// rows for one account. Keep the earliest row per account and delete the rest.
async function collapseDuplicates(base44, gatheringId) {
  const rows = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }).catch(() => []);
  const byUid = new Map();
  for (const m of rows || []) {
    const uid = (m.user_id || '').trim();
    if (!isStableUserId(uid)) continue;
    const prev = byUid.get(uid);
    if (!prev) { byUid.set(uid, [m]); continue; }
    prev.push(m);
  }
  const extras = [];
  for (const list of byUid.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''));
    extras.push(...list.slice(1));
  }
  if (extras.length) await base44.asServiceRole.entities.Member.deleteMany({ id: { $in: extras.map((m) => m.id) } });
}