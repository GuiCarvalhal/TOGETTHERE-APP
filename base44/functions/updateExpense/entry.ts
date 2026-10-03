import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, participantUserIds, participantMemberIds, gatheringOwnerUserId, resolvePayerUid, buildSplitRecords } from '../../shared/gatheringAcl.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';
import { secrets } from 'base44:runtime';
import { fetchUsdRates, convertViaUsd } from '../../shared/currencyRates.ts';

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

    // Preserve legacy allocations: if this expense already has a split for a
    // member who is now a Viewer (a former participant demoted after the
    // expense was created), REFUSE the edit rather than rewriting splits.
    // Rewriting would silently drop the viewer's allocation and redistribute
    // the total among remaining participants. Financial records are never
    // migrated; the owner must change the member's role back to Member first.
    const participantIdSet = new Set(participantMemberIds(members));
    const existingSplits = await base44.asServiceRole.entities.ExpenseSplit.filter({ expense_id: expense_id });
    const legacyViewerSplit = (existingSplits || []).find((s) => !participantIdSet.has(s.member_id));
    if (legacyViewerSplit) {
      return Response.json({ error: 'This expense includes a member who is now a Viewer and cannot be edited. Ask the owner to change their role back to Member first.' }, { status: 409 });
    }
    // Eligibility guard for the incoming allocations: payer + every new split
    // member must be a current participant (no viewers).
    if (!expense.payer_member_id || !participantIdSet.has(expense.payer_member_id)) {
      return Response.json({ error: 'The selected payer is no longer a participant' }, { status: 400 });
    }
    const invalidSplit = (splits || []).find((s) => !participantIdSet.has(s.member_id));
    if (invalidSplit) {
      return Response.json({ error: 'One or more split members are no longer participants' }, { status: 400 });
    }

    // Re-snapshot the display-currency amount on edit (amount/currency may have
    // changed). Same rule as createExpense: identity when same currency, else a
    // fresh live conversion at save time; null when unavailable (fallback render).
    const displayCurrency = (expense.display_currency || '').toUpperCase();
    let displayAmount = null;
    if (displayCurrency) {
      const payCurrency = (expense.currency || 'USD').toUpperCase();
      if (displayCurrency === payCurrency) {
        displayAmount = Number(expense.amount);
      } else {
        const appId = secrets.get('OPENEXCHANGERATES_APP_ID');
        if (appId) {
          try {
            const rates = await fetchUsdRates(appId);
            const conv = convertViaUsd(expense.amount, payCurrency, displayCurrency, rates);
            if (conv != null) displayAmount = Math.round(conv * 100) / 100;
          } catch { /* leave null — historical fallback applies at render */ }
        }
      }
    }

    await base44.asServiceRole.entities.Expense.update(expense_id, {
      payer_member_id: expense.payer_member_id,
      title: expense.title,
      amount: Number(expense.amount),
      currency: expense.currency || 'USD',
      display_amount: displayAmount,
      display_currency: displayCurrency,
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