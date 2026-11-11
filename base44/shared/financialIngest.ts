// Shared ingestion for the financial pipeline.
//
// Every source — statement file, pasted statement text and card/transaction
// emails — lands transactions through this module, so dedupe, category and
// gathering suggestions and review state are identical everywhere and there is
// exactly one place where a source row becomes a FinancialTransaction.
//
// Idempotency is layered, because the same charge can reach us twice under
// different ids, from two different sources, or after a pending -> posted
// transition:
//   1. external_id  — the source's own stable id for that row
//   2. fingerprint  — normalized provider|date|amount|currency|merchant|direction
//   3. loose key    — date|amount|currency|direction|merchant prefix, which is
//                     what reconciles the same charge seen in an email alert and
//                     in the statement export days later
//   4. pending key  — amount|currency|direction|merchant, used only against a
//                     stored PENDING row, whose date the card issuer changes
//                     when the charge settles
// A stored `pending` row is upgraded in place to `posted` (keeping its id, so
// the review state and any link survive) instead of being inserted again.
//
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

function merchantKey(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}

// Same charge, same day, same amount and direction: this is the key that lets an
// email alert and a statement export agree without sharing an id.
function looseKey(row: { date: string; amount: number; currency: string; direction: string; merchant: string }) {
  const merchant = merchantKey(row.merchant);
  if (!merchant) return '';
  return [row.date, Number(row.amount).toFixed(2), row.direction, String(row.currency || '').toUpperCase(), merchant].join('|');
}

// Pending charges settle under a new posting date, so the date is deliberately
// absent here: only matched against a row that is still `pending`.
function pendingKey(row: { amount: number; currency: string; direction: string; merchant: string }) {
  const merchant = merchantKey(row.merchant);
  if (!merchant) return '';
  return [Number(row.amount).toFixed(2), row.direction, String(row.currency || '').toUpperCase(), merchant].join('|');
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

  // Dedupe scope is the USER, not the connection: the same card charge can be
  // imported once from an email alert and once from the statement file, and the
  // second one must not create a twin row.
  const stored = await base44.asServiceRole.entities.FinancialTransaction.filter({ owner_user_id: user.id });

  const byExternalId = new Map<string, any>();
  const byFingerprint = new Map<string, any>();
  const byLoose = new Map<string, any>();
  const byPending = new Map<string, any>();

  for (const row of stored || []) {
    if (row.external_id) byExternalId.set(row.external_id, row);
    if (row.fingerprint) byFingerprint.set(row.fingerprint, row);
    const merchant = row.merchant || row.description || '';
    const loose = looseKey({
      date: row.date,
      amount: row.amount,
      currency: row.currency,
      direction: row.direction,
      merchant,
    });
    if (loose) byLoose.set(loose, row);
    if (row.status === 'pending') {
      const pending = pendingKey({
        amount: row.amount,
        currency: row.currency,
        direction: row.direction,
        merchant,
      });
      if (pending) byPending.set(pending, row);
    }
  }

  const keys = [user.id, String(user.email || '').toLowerCase()].filter(Boolean);
  const rows: any[] = [];
  const upgrades: any[] = [];
  const rejects: string[] = [];
  let duplicates = 0;

  for (const raw of rawRows || []) {
    const normalized = normalizeTransaction(raw, { provider: connection.provider, currency: connection.currency });
    if (normalized.error) { rejects.push(normalized.error); continue; }
    const tx: any = normalized.transaction;

    if (!tx.external_id) { rejects.push('missing_external_id'); continue; }

    const merchant = tx.merchant || tx.description || '';
    const isRepeatOfSameDay = Number(tx.occurrence) > 1;

    let match = byExternalId.get(tx.external_id) || byFingerprint.get(tx.fingerprint) || null;
    if (!match && !isRepeatOfSameDay) {
      const loose = looseKey({ date: tx.date, amount: tx.amount, currency: tx.currency, direction: tx.direction, merchant });
      const pending = pendingKey({ amount: tx.amount, currency: tx.currency, direction: tx.direction, merchant });
      match = (loose ? byLoose.get(loose) : null) || (pending ? byPending.get(pending) : null) || null;
    }

    if (match) {
      // Same charge, now settled: keep the row (and its review state / link) and
      // bring it up to date instead of inserting a duplicate.
      if (match.status === 'pending' && tx.status === 'posted') {
        upgrades.push({
          id: match.id,
          status: 'posted',
          occurred_at: tx.occurred_at,
          date: tx.date,
          amount: tx.amount,
          currency: tx.currency,
          direction: tx.direction,
          external_id: tx.external_id || match.external_id,
          fingerprint: tx.fingerprint || match.fingerprint,
          description: tx.description || match.description,
        });
      } else {
        duplicates += 1;
      }
      continue;
    }

    byExternalId.set(tx.external_id, tx);
    byFingerprint.set(tx.fingerprint, tx);
    const loose = looseKey({ date: tx.date, amount: tx.amount, currency: tx.currency, direction: tx.direction, merchant });
    if (loose) byLoose.set(loose, tx);

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
  if (upgrades.length) {
    await base44.asServiceRole.entities.FinancialTransaction.bulkUpdate(upgrades);
  }

  return { imported: rows.length, duplicates, upgraded: upgrades.length, rejected: rejects };
}