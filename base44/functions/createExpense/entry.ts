import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, participantUserIds, gatheringOwnerUserId, resolvePayerUid, buildSplitRecords } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';
import { secrets } from 'base44:runtime';
import { fetchUsdRates, convertViaUsd } from '../../shared/currencyRates.ts';

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

    // Capture the display-currency snapshot ONCE at transaction time so this
    // expense renders deterministically forever (no later live-rate drift). The
    // display currency is the creator's current base currency (passed from the
    // client). Same currency => identity snapshot; cross-currency => convert via
    // the live USD rate now. If the rate is unavailable, display_amount stays
    // null and the row falls back to live conversion at render (historical).
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

    const created = await base44.asServiceRole.entities.Expense.create({
      gathering_id,
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

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/expenses`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'expenses', excludeUserIds: [user.id],
        heading: 'New expense',
        message: `${me.full_name || 'Someone'} added "${expense.title}" — ${Number(expense.amount)} ${expense.currency || 'USD'}.`,
        data: { gathering_id, route, kind: 'expense_added' },
        url: origin ? origin + route : undefined,
        dedupKey: `expense_added:${created.id}`,
      });
    }

    return Response.json({ expense: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}