import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

// Settles/unsettles an expense and notifies participants of the change.
// Preserves the existing permission model (owner or payer/creator only).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, expense_id, settled } = body;
    if (!gathering_id || !expense_id) return Response.json({ error: 'gathering_id and expense_id required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') return Response.json({ error: 'Only participants can settle expenses' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.Expense.get(expense_id);
    if (!existing || existing.gathering_id !== gathering_id) return Response.json({ error: 'Expense not found' }, { status: 404 });
    const isOwner = me.role === 'owner' || existing.owner_user_id === user.id;
    const isPayer = existing.payer_user_id === user.id || existing.created_by_id === user.id;
    if (!isOwner && !isPayer) return Response.json({ error: 'You can only settle expenses you paid or created' }, { status: 403 });

    const next = typeof settled === 'boolean' ? settled : !existing.settled;
    await base44.asServiceRole.entities.Expense.update(expense_id, { settled: next });

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/expenses`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id,
        category: 'expenses',
        excludeUserIds: [user.id],
        heading: next ? 'Expense settled' : 'Expense reopened',
        message: `${me.full_name || 'Someone'} marked "${existing.title}" as ${next ? 'settled' : 'unsettled'}.`,
        data: { gathering_id, route, kind: 'expense_settled' },
        url: origin ? origin + route : undefined,
        dedupKey: `expense_settled:${expense_id}:${next ? 1 : 0}`,
      });
    }

    return Response.json({ ok: true, settled: next });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}