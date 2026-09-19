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
    .filter((m) => m.role === 'owner' || m.role === 'member')
    .map((m) => m.user_id)
    .filter(Boolean);
}

export function gatheringOwnerUserId(gathering, members) {
  if (gathering && gathering.owner_user_id) return gathering.owner_user_id;
  const owner = (members || []).find((m) => m.role === 'owner');
  if (owner && owner.user_id) return owner.user_id;
  return (gathering && gathering.created_by_id) || null;
}

// Recompute and apply member_user_ids / participant_user_ids across a gathering's
// children + the gathering itself. Use after any membership/role change.
export async function syncChildArrays(base44, gatheringId) {
  const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
  const all = allMemberUserIds(members);
  const parts = participantUserIds(members);
  await Promise.all([
    base44.asServiceRole.entities.Gathering.updateMany({ id: gatheringId }, { $set: { member_user_ids: all, participant_user_ids: parts } }),
    base44.asServiceRole.entities.JourneyItem.updateMany({ gathering_id: gatheringId }, { $set: { member_user_ids: all } }),
    base44.asServiceRole.entities.Expense.updateMany({ gathering_id: gatheringId }, { $set: { participant_user_ids: parts } }),
    base44.asServiceRole.entities.ExpenseSplit.updateMany({ gathering_id: gatheringId }, { $set: { participant_user_ids: parts } }),
  ]);
  return { all, parts, members };
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