import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { fetchProviderTransactions, ProviderError } from '../../shared/financialProviders.ts';
import { ingestTransactions, loadGatheringRanges } from '../../shared/financialIngest.ts';

// Imports bank/card transactions for the current user's provider connections.
//
// The ingestion itself (dedupe, suggestions, review state) lives in
// shared/financialIngest.ts and is shared with the statement importer, so both
// sources produce identical records.
//
// Statement-import accounts are skipped here: they have no live provider and are
// fed by importFinancialStatement.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const onlyId = body.connection_id || '';
    // Optional provider payload (the plug point for a real provider/webhook).
    const suppliedRows = Array.isArray(body.transactions) ? body.transactions : null;

    const all = await base44.asServiceRole.entities.FinancialConnection.filter({ target_user_id: user.id });
    const connections = (all || []).filter((c) => c.status !== 'disconnected'
      && c.provider !== 'import'
      && (!onlyId || c.id === onlyId));
    if (!connections.length) {
      return Response.json({ error: 'No account to sync', reason: 'no_provider_connection' }, { status: 404 });
    }

    // Itinerary ranges for gathering suggestions, resolved once per call.
    const ranges = await loadGatheringRanges(base44, user.id);

    const results = [];
    let imported = 0;
    let duplicates = 0;
    let rejected = 0;

    for (const connection of connections) {
      let rawRows = [];
      let failure = '';
      try {
        rawRows = suppliedRows || await fetchProviderTransactions(connection);
      } catch (e) {
        failure = e instanceof ProviderError ? e.reason : 'provider_unavailable';
      }

      const ingested = failure
        ? { imported: 0, duplicates: 0, rejected: [] as string[] }
        : await ingestTransactions(base44, {
          user,
          connection,
          rawRows,
          source: suppliedRows ? 'provider_webhook' : 'provider_sync',
          ranges,
        });

      imported += ingested.imported;
      duplicates += ingested.duplicates;
      rejected += ingested.rejected.length;

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
        imported: ingested.imported,
        duplicates: ingested.duplicates,
        rejected: ingested.rejected,
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