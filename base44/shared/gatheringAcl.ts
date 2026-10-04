// Shared ACL helpers for TOGETTHERE gathering functions.
// Denormalized role/ownership fields let RLS enforce access without cross-entity lookups.

export async function getMyMember(base44, gatheringId, userId) {
  const list = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId, user_id: userId });
  return list && list[0] ? list[0] : null;
}

export function allMemberUserIds(members) {
  return (members || []).map((m) => m.user_id).filter(Boolean);
}

export function participantUserIds(members) {
  return (members || [])
    .filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'member')
    .map((m) => m.user_id)
    .filter(Boolean);
}

// Member ids (not user ids) of participants only (owner/member). Viewers are
// excluded. Used to validate that a new/updated expense payer and every split
// member is a current participant, so a viewer can never be assigned a payer
// or split allocation — defense-in-depth behind the form's participant picker.
export function participantMemberIds(members) {
  return (members || [])
    .filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'member')
    .map((m) => m.id);
}

export function gatheringOwnerUserId(gathering, members) {
  if (gathering && gathering.owner_user_id) return gathering.owner_user_id;
  const owner = (members || []).find((m) => m.role === 'owner');
  if (owner && owner.user_id) return owner.user_id;
  return (gathering && gathering.created_by_id) || null;
}

// Match the current user's member record from an already-fetched member list.
// Tries the exact app user id first, then falls back to a case-insensitive email
// match against user_id / contact_info — beta imports stored the member's email
// in user_id, so unhealed records are matched by email until self-healed.
export function matchMyMember(members, user) {
  if (!user || !user.id) return null;
  const uid = user.id;
  const byId = (members || []).find((m) => m.user_id === uid) || null;
  if (byId) return byId;
  const email = (user.email || '').trim().toLowerCase();
  if (!email) return null;
  return (members || []).find((m) => {
    const u = (m.user_id || '').toString().trim().toLowerCase();
    const c = (m.contact_info || '').toString().trim().toLowerCase();
    return u === email || c === email;
  }) || null;
}

// Reattach a beta-imported member record to the real app user id and store the
// canonical email. Idempotent — no-op when already healed.
export async function healMember(base44, member, user) {
  if (!member || !user || !user.id) return member;
  const email = (user.email || '').trim().toLowerCase();
  const alreadyHealed = member.user_id === user.id && (!email || (member.email || '').toLowerCase() === email);
  if (alreadyHealed) return member;
  const updates = { user_id: user.id };
  if (email) updates.email = email;
  await base44.asServiceRole.entities.Member.update(member.id, updates);
  return { ...member, ...updates };
}

// Resolve ALL of the current user's member records across every gathering,
// self-healing beta-imported (email-in-user_id) records to the real app user id.
// Returns the user's member records and the gathering ids that were healed.
export async function resolveMyMembers(base44, user) {
  if (!user || !user.id) return { members: [], healedGatheringIds: [] };
  const uid = user.id;
  const email = (user.email || '').trim().toLowerCase();
  const byId = await base44.asServiceRole.entities.Member.filter({ user_id: uid });
  const members = [...(byId || [])];
  const healedGatheringIds = [];
  if (!email) return { members, healedGatheringIds };

  const [byEmail, byContact] = await Promise.all([
    base44.asServiceRole.entities.Member.filter({ user_id: email }),
    base44.asServiceRole.entities.Member.filter({ contact_info: email }),
  ]);
  let candidates = [...(byEmail || []), ...(byContact || [])];
  // Case-insensitive fallback only if exact-case found nothing (covers mixed-case imports).
  if (!candidates.length) {
    const all = await base44.asServiceRole.entities.Member.list('-created_date', 500);
    candidates = (all || []).filter((m) => {
      const u = (m.user_id || '').toString().trim().toLowerCase();
      const c = (m.contact_info || '').toString().trim().toLowerCase();
      return u === email || c === email;
    });
  }
  const seen = new Set(members.map((m) => m.id));
  const toHeal = [];
  for (const m of candidates) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    toHeal.push(m);
  }
  if (toHeal.length) {
    await base44.asServiceRole.entities.Member.bulkUpdate(
      toHeal.map((m) => ({ id: m.id, user_id: uid, email }))
    );
    for (const m of toHeal) {
      members.push({ ...m, user_id: uid, email });
      if (m.gathering_id) healedGatheringIds.push(m.gathering_id);
    }
  }
  return { members, healedGatheringIds };
}

// Recompute and apply member_user_ids / participant_user_ids across a gathering's
// children + the gathering itself. Also heals owner_user_id on the gathering and
// member records. Use after any membership/role change or member self-heal.
export async function syncChildArrays(base44, gatheringId) {
  const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
  const all = allMemberUserIds(members);
  const parts = participantUserIds(members);
  const owner = (members || []).find((m) => m.role === 'owner') || null;
  const ownerUid = (owner && owner.user_id) || null;
  await Promise.all([
    base44.asServiceRole.entities.Gathering.updateMany({ id: gatheringId }, { $set: { member_user_ids: all, participant_user_ids: parts, ...(ownerUid ? { owner_user_id: ownerUid } : {}) } }),
    base44.asServiceRole.entities.JourneyItem.updateMany({ gathering_id: gatheringId }, { $set: { member_user_ids: all } }),
    base44.asServiceRole.entities.Expense.updateMany({ gathering_id: gatheringId }, { $set: { participant_user_ids: parts } }),
    base44.asServiceRole.entities.ExpenseSplit.updateMany({ gathering_id: gatheringId }, { $set: { participant_user_ids: parts } }),
    ...(ownerUid ? [base44.asServiceRole.entities.Member.updateMany({ gathering_id: gatheringId }, { $set: { owner_user_id: ownerUid } })] : []),
  ]);
  return { all, parts, members, ownerUid };
}

export function resolvePayerUid(members, payerMemberId, fallback) {
  const payer = (members || []).find((m) => m.id === payerMemberId);
  return (payer && payer.user_id) || fallback;
}

export function buildSplitRecords({ expenseId, gatheringId, splits, ownerUid, payerUid, parts }) {
  return (splits || []).map((s) => ({
    expense_id: expenseId,
    gathering_id: gatheringId,
    member_id: s.member_id,
    amount: Number(s.amount) || 0,
    share: Number(s.share) || 0,
    owner_user_id: ownerUid,
    payer_user_id: payerUid,
    participant_user_ids: parts,
  }));
}