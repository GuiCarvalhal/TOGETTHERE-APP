import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Review actions on an imported transaction: ignore, reset, or link it to an
// Expense the user created from it (via the standard expense form).
//
// Linking never creates an expense by itself — it only records the id of an
// expense that already exists and that the user has permission to see.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const txId = body.id;
    const action = String(body.action || '').toLowerCase();
    if (!txId) return Response.json({ error: 'id required' }, { status: 400 });

    const tx = await base44.asServiceRole.entities.FinancialTransaction.get(txId);
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });

    const mine = [user.id, String(user.email || '').toLowerCase()];
    const owned = (tx.target_user_keys || []).some((k) => mine.includes(String(k || '').toLowerCase()))
      || tx.owner_user_id === user.id;
    if (!owned) return Response.json({ error: 'Not allowed' }, { status: 403 });

    if (action === 'ignore') {
      const updated = await base44.asServiceRole.entities.FinancialTransaction.update(tx.id, {
        review_status: 'ignored',
      });
      return Response.json({ transaction: updated });
    }

    if (action === 'reset') {
      const suggested = (tx.category_confidence >= 0.7 && tx.category_suggestion && tx.category_suggestion !== 'other')
        || !!tx.gathering_suggestion_id;
      const updated = await base44.asServiceRole.entities.FinancialTransaction.update(tx.id, {
        review_status: suggested ? 'suggested' : 'new',
        linked_expense_id: '',
        linked_gathering_id: '',
        linked_at: undefined,
        linked_by_user_id: undefined,
      });
      return Response.json({ transaction: updated });
    }

    if (action === 'link') {
      const expenseId = body.expense_id;
      const gatheringId = body.gathering_id;
      if (!expenseId || !gatheringId) {
        return Response.json({ error: 'expense_id and gathering_id required', reason: 'missing_link' }, { status: 400 });
      }

      const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
      const me = (members || []).find((m) => m.user_id === user.id || (m.email || '').toLowerCase() === String(user.email || '').toLowerCase());
      if (!me || me.role === 'viewer') {
        return Response.json({ error: 'Only participants can link expenses', reason: 'not_participant' }, { status: 403 });
      }

      const expense = await base44.asServiceRole.entities.Expense.get(expenseId);
      if (!expense || expense.gathering_id !== gatheringId) {
        return Response.json({ error: 'Expense not found in this gathering', reason: 'expense_not_found' }, { status: 404 });
      }

      const updated = await base44.asServiceRole.entities.FinancialTransaction.update(tx.id, {
        review_status: 'linked',
        linked_expense_id: expenseId,
        linked_gathering_id: gatheringId,
        linked_at: new Date().toISOString(),
        linked_by_user_id: user.id,
      });
      return Response.json({ transaction: updated });
    }

    return Response.json({ error: 'Unknown action', reason: 'unknown_action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}