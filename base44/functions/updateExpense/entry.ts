import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, participantUserIds, gatheringOwnerUserId, resolvePayerUid, buildSplitRecords } from '../../shared/gatheringAcl.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, expense_id, expense, splits } = body;
    if (!gathering_id || !expense_id || !expense) return Response.json({ error: 'gathering_id, expense_id and expense required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') return Response.json({ error: 'Only participants can edit expenses' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.Expense.get(expense_id);
    const isOwner = me.role === 'owner' || existing.owner_user_id === user.id;
    const isPayer = existing.payer_user_id === user.id || existing.created_by_id === user.id;
    if (!isOwner && !isPayer) {
      return Response.json({ error: 'You can only edit expenses you paid or created' }, { status: 403 });
    }

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const parts = participantUserIds(members);
    const payerUid = resolvePayerUid(members, expense.payer_member_id, existing.payer_user_id || user.id);

    await base44.asServiceRole.entities.Expense.update(expense_id, {
      payer_member_id: expense.payer_member_id,
      title: expense.title,
      amount: Number(expense.amount),
      currency: expense.currency || 'USD',
      split_method: expense.split_method || 'equal',
      category: expense.category || 'other',
      receipt: expense.receipt || '',
      date: expense.date,
      payer_user_id: payerUid,
      participant_user_ids: parts,
    });

    await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ expense_id: expense_id });
    const splitRecords = buildSplitRecords({ expenseId: expense_id, gatheringId: gathering_id, splits, ownerUid, payerUid, parts });
    if (splitRecords.length) await base44.asServiceRole.entities.ExpenseSplit.bulkCreate(splitRecords);

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/expenses`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'expenses', excludeUserIds: [user.id],
        heading: 'Expense updated',
        message: `${me.full_name || 'Someone'} updated "${expense.title}".`,
        data: { gathering_id, route, kind: 'expense_updated' },
        url: origin ? origin + route : undefined,
        dedupKey: `expense_updated:${expense_id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}