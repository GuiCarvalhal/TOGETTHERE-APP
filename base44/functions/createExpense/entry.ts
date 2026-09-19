import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, participantUserIds, gatheringOwnerUserId, resolvePayerUid, buildSplitRecords } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, expense, splits } = body;
    if (!gathering_id || !expense) return Response.json({ error: 'gathering_id and expense required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') {
      return Response.json({ error: 'Only participants can add expenses' }, { status: 403 });
    }
    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const parts = participantUserIds(members);
    const payerUid = resolvePayerUid(members, expense.payer_member_id, user.id);

    const created = await base44.asServiceRole.entities.Expense.create({
      gathering_id,
      payer_member_id: expense.payer_member_id,
      title: expense.title,
      amount: Number(expense.amount),
      currency: expense.currency || 'USD',
      split_method: expense.split_method || 'equal',
      category: expense.category || 'other',
      receipt: expense.receipt || '',
      date: expense.date,
      settled: false,
      owner_user_id: ownerUid,
      payer_user_id: payerUid,
      participant_user_ids: parts,
    });

    const splitRecords = buildSplitRecords({ expenseId: created.id, gatheringId: gathering_id, splits, ownerUid, payerUid, parts });
    if (splitRecords.length) await base44.asServiceRole.entities.ExpenseSplit.bulkCreate(splitRecords);

    await logActivity(base44, {
      gatheringId: gathering_id, type: 'expense_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} added "${expense.title}" to expenses`,
      ownerUserId: ownerUid, participantUserIds: parts,
    });

    return Response.json({ expense: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}