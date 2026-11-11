import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns the current user's financial connections and imported transactions.
// Sanitized on purpose: no provider reference and no credential material ever
// leaves the server.
//
// The transaction query is intentionally a plain filter (no sort/limit options):
// the newest 200 rows are selected in memory, which keeps this working on
// freshly created entities and keeps the response payload bounded.
const MAX_ROWS = 200;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const [connections, allTransactions] = await Promise.all([
      base44.asServiceRole.entities.FinancialConnection.filter({ target_user_id: user.id }),
      base44.asServiceRole.entities.FinancialTransaction.filter({ owner_user_id: user.id }),
    ]);

    const rows = (Array.isArray(allTransactions) ? allTransactions : (allTransactions?.items || []))
      .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
      .slice(0, MAX_ROWS);

    const counts = { new: 0, suggested: 0, linked: 0, ignored: 0 };
    for (const tx of rows) {
      if (counts[tx.review_status] !== undefined) counts[tx.review_status] += 1;
    }

    return Response.json({
      connections: (connections || []).map((c) => ({
        id: c.id,
        provider: c.provider,
        institution_name: c.institution_name || '',
        account_mask: c.account_mask || '',
        account_type: c.account_type || 'checking',
        currency: c.currency || 'USD',
        status: c.status || 'connected',
        last_sync_at: c.last_sync_at || null,
        last_attempt_at: c.last_attempt_at || null,
        last_error: c.last_error || '',
      })),
      transactions: rows.map((tx) => ({
        id: tx.id,
        connection_id: tx.connection_id,
        provider: tx.provider,
        account_mask: tx.account_mask || '',
        date: tx.date,
        occurred_at: tx.occurred_at,
        description: tx.description || '',
        merchant: tx.merchant || '',
        raw_category: tx.raw_category || '',
        currency: tx.currency,
        amount: tx.amount,
        direction: tx.direction,
        status: tx.status,
        review_status: tx.review_status,
        category_suggestion: tx.category_suggestion || 'other',
        category_confidence: tx.category_confidence || 0,
        category_signals: tx.category_signals || [],
        gathering_suggestion_id: tx.gathering_suggestion_id || '',
        gathering_confidence: tx.gathering_confidence || 0,
        gathering_reason: tx.gathering_reason || '',
        participant_suggestion_ids: tx.participant_suggestion_ids || [],
        linked_expense_id: tx.linked_expense_id || '',
        linked_gathering_id: tx.linked_gathering_id || '',
      })),
      counts,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}