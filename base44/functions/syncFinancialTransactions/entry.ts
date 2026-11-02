import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { normalizeTransaction, suggestGatheringForDate } from '../../shared/financialTransactions.ts';
import { fetchProviderTransactions, ProviderError } from '../../shared/financialProviders.ts';

// Imports bank/card transactions for the current user's connections.
//
// Idempotency is deliberately layered, because a provider can resend the same
// charge under a new id or after a pending -> posted transition:
//   1. external_id  — the provider's own id for that connection
//   2. fingerprint  — normalized date|amount|currency|merchant
// Both sets are checked against what is already stored AND against the rows
// created earlier in the same call, so a batch that repeats itself imports once.
//
// Nothing here creates an Expense: rows land as `new`/`suggested` for review.
// A row that fails normalization is skipped and reported (reason code), so the
// rest of the batch still lands and a retry is safe.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const onlyId = body.connection_id || '';
    // Optional provider payload (the plug point for a real provider/webook).
    const suppliedRows = Array.isArray(body.transactions) ? body.transactions : null;

    const all = await base44.asServiceRole.entities.FinancialConnection.filter({ target_user_id: user.id });
    const connections = (all || []).filter((c) => c.status !== 'disconnected' && (!onlyId || c.id === onlyId));
    if (!connections.length) {
      return Response.json({ error: 'No connected account', reason: 'no_connection' }, { status: 404 });
    }

    // Itinerary ranges for gathering suggestions, resolved once per call.
    const ranges = await loadGatheringRanges(base44, user.id);

    const results = [];
    let imported = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const connection of connections) {
      let rawRows;
      let failure = '';
      try {
        rawRows = suppliedRows || await fetchProviderTransactions(connection);
      } catch (e) {
        failure = e instanceof ProviderError ? e.reason : 'provider_unavailable';
        rawRows = [];
      }

      const stored = await base44.asServiceRole.entities.FinancialTransaction.filter({ connection_id: connection.id });
      const seenIds = new Set((stored || []).map((t) => t.external_id).filter(Boolean));
      const seenFingerprints = new Set((stored || []).map((t) => t.fingerprint).filter(Boolean));

      const keys = [user.id, String(user.email || '').toLowerCase()].filter(Boolean);
      const rows = [];
      const rejects = [];

      for (const raw of rawRows) {
        const normalized = normalizeTransaction(raw, { provider: connection.provider, currency: connection.currency });
        if (normalized.error) { rejects.push(normalized.error); continue; }
        const tx = normalized.transaction;

        if (!tx.external_id) { rejects.push('missing_external_id'); continue; }
        if (seenIds.has(tx.external_id) || seenFingerprints.has(tx.fingerprint)) { duplicates += 1; continue; }

        seenIds.add(tx.external_id);
        seenFingerprints.add(tx.fingerprint);

        const gathering = suggestGatheringForDate(tx.date, ranges.list);
        const hasSuggestion = !!gathering || (tx.category_confidence >= 0.7 && tx.category_suggestion !== 'other');

        rows.push({
          ...tx,
          connection_id: connection.id,
          provider: connection.provider,
          account_mask: connection.account_mask || '',
          owner_user_id: user.id,
          target_user_keys: keys,
          review_status: hasSuggestion ? 'suggested' : 'new',
          gathering_suggestion_id: gathering?.gathering_id || '',
          gathering_confidence: gathering?.confidence || 0,
          gathering_reason: gathering?.reason || 'no_signal',
          participant_suggestion_ids: gathering ? (ranges.participants[gathering.gathering_id] || []) : [],
          source: suppliedRows ? 'provider_webhook' : 'provider_sync',
        });
      }

      if (rows.length) {
        await base44.asServiceRole.entities.FinancialTransaction.bulkCreate(rows);
        imported += rows.length;
      }
      rejected += rejects.length;

      const now = new Date().toISOString();
      await base44.asServiceRole.entities.FinancialConnection.update(connection.id, {
        last_attempt_at: now,
        last_sync_at: failure ? connection.last_sync_at : now,
        status: failure ? 'attention' : 'connected',
        last_error: failure,
      });

      results.push({
        connection_id: connection.id,
        provider: connection.provider,
        imported: rows.length,
        duplicates,
        rejected: rejects.map((reason) => reason),
        error: failure,
      });
    }

    return Response.json({
      results,
      summary: {
        imported,
        duplicates,
        rejected,
        connections: results.length,
        failed: results.filter((r) => r.error).length,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Builds, per gathering the user participates in, its itinerary date range and
// its participant user ids — enough to suggest "this charge happened during this
// trip" without touching any gathering data.
async function loadGatheringRanges(base44, userId) {
  const memberships = await base44.asServiceRole.entities.Member.filter({ user_id: userId });
  const participantRoles = new Set(['owner', 'admin', 'member']);
  const gatheringIds = [...new Set((memberships || [])
    .filter((m) => participantRoles.has(m.role))
    .map((m) => m.gathering_id)
    .filter(Boolean))];

  const list = [];
  const participants = {};
  if (!gatheringIds.length) return { list, participants };

  const [memberLists, itemLists] = await Promise.all([
    Promise.all(gatheringIds.map((gid) => base44.asServiceRole.entities.Member.filter({ gathering_id: gid }))),
    Promise.all(gatheringIds.map((gid) => base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }))),
  ]);
  const allMembers = memberLists.flat();

  for (const m of allMembers || []) {
    if (!participantRoles.has(m.role) || !m.user_id) continue;
    (participants[m.gathering_id] = participants[m.gathering_id] || []).push(m.user_id);
  }

  gatheringIds.forEach((gid, index) => {
    const dates = (itemLists[index] || [])
      .map((item) => (item.start_datetime || '').slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (!dates.length) return;
    list.push({ gathering_id: gid, first_date: dates[0], last_date: dates[dates.length - 1], item_dates: dates });
  });

  return { list, participants };
}