// Shared ingestion for the financial pipeline.
//
// Every source — provider sync, provider webhook and the statement importer —
// lands transactions through this module, so dedupe, category/gathering
// suggestions and review state are identical everywhere and there is exactly one
// place where a bank row becomes a FinancialTransaction.
//
// Idempotency is layered because a source can resend the same charge under a new
// id or after a pending -> posted transition:
//   1. external_id  — the source's own stable id for that row
//   2. fingerprint  — normalized direction|date|amount|currency|merchant
// Nothing here creates an Expense: rows land as `new`/`suggested` for review.

import { normalizeTransaction, suggestGatheringForDate } from './financialTransactions.ts';

// Builds, per gathering the user participates in, its itinerary date range and
// its participant user ids — enough to suggest "this charge happened during this
// trip" without touching any gathering data.
export async function loadGatheringRanges(base44: any, userId: string) {
  const memberships = await base44.asServiceRole.entities.Member.filter({ user_id: userId });
  const participantRoles = new Set(['owner', 'admin', 'member']);
  const gatheringIds = [...new Set((memberships || [])
    .filter((m: any) => participantRoles.has(m.role))
    .map((m: any) => m.gathering_id)
    .filter(Boolean))];

  const list: any[] = [];
  const participants: Record<string, string[]> = {};
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

  (gatheringIds as string[]).forEach((gid, index) => {
    const dates = (itemLists[index] || [])
      .map((item: any) => (item.start_datetime || '').slice(0, 10))
      .filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();
    if (!dates.length) return;
    list.push({ gathering_id: gid, first_date: dates[0], last_date: dates[dates.length - 1], item_dates: dates });
  });

  return { list, participants };
}

export async function ingestTransactions(
  base44: any,
  opts: {
    user: any;
    connection: any;
    rawRows: any[];
    source: string;
    ranges?: { list: any[]; participants: Record<string, string[]> };
  },
) {
  const { user, connection, rawRows, source } = opts;
  const ranges = opts.ranges || await loadGatheringRanges(base44, user.id);

  const stored = await base44.asServiceRole.entities.FinancialTransaction.filter({ connection_id: connection.id });
  const seenIds = new Set((stored || []).map((t: any) => t.external_id).filter(Boolean));
  const seenFingerprints = new Set((stored || []).map((t: any) => t.fingerprint).filter(Boolean));

  const keys = [user.id, String(user.email || '').toLowerCase()].filter(Boolean);
  const rows: any[] = [];
  const rejects: string[] = [];
  let duplicates = 0;

  for (const raw of rawRows || []) {
    const normalized = normalizeTransaction(raw, { provider: connection.provider, currency: connection.currency });
    if (normalized.error) { rejects.push(normalized.error); continue; }
    const tx: any = normalized.transaction;

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
      source,
    });
  }

  if (rows.length) {
    await base44.asServiceRole.entities.FinancialTransaction.bulkCreate(rows);
  }

  return { imported: rows.length, duplicates, rejected: rejects };
}