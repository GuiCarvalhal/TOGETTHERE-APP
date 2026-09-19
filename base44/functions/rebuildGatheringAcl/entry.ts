import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { allMemberUserIds, participantUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';

// Maintenance / backfill: recompute every denormalized ACL field for a gathering.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const [gathering, members, items, expenses, splits] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.Expense.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.ExpenseSplit.filter({ gathering_id: gatheringId }),
    ]);

    const ownerUid = gatheringOwnerUserId(gathering, members);
    const all = allMemberUserIds(members);
    const parts = participantUserIds(members);
    const memberById = {};
    (members || []).forEach((m) => { memberById[m.id] = m; });

    await base44.asServiceRole.entities.Gathering.updateMany({ id: gatheringId }, { $set: { owner_user_id: ownerUid, member_user_ids: all, participant_user_ids: parts } });

    for (const m of (members || [])) {
      await base44.asServiceRole.entities.Member.update(m.id, { owner_user_id: ownerUid });
    }
    for (const it of (items || [])) {
      await base44.asServiceRole.entities.JourneyItem.update(it.id, { owner_user_id: ownerUid, member_user_ids: all });
    }
    for (const e of (expenses || [])) {
      const payer = memberById[e.payer_member_id];
      const payerUid = (payer && payer.user_id) || e.payer_user_id || ownerUid;
      await base44.asServiceRole.entities.Expense.update(e.id, { owner_user_id: ownerUid, payer_user_id: payerUid, participant_user_ids: parts });
    }
    for (const s of (splits || [])) {
      const exp = (expenses || []).find((e) => e.id === s.expense_id);
      const payerUid = (exp && exp.payer_user_id) || ownerUid;
      await base44.asServiceRole.entities.ExpenseSplit.update(s.id, { owner_user_id: ownerUid, payer_user_id: payerUid, participant_user_ids: parts });
    }

    return Response.json({ ok: true, owner_user_id: ownerUid, members: (members || []).length, items: (items || []).length, expenses: (expenses || []).length, splits: (splits || []).length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}