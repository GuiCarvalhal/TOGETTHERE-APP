import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { parseStatement, STATEMENT_MAX_CHARS } from '../../shared/statementImport.ts';
import { ingestTransactions, loadGatheringRanges } from '../../shared/financialIngest.ts';

// Imports a bank/card statement export (CSV / TSV / OFX / QFX / plain text) into
// one of the user's statement-import accounts.
//
// The file is parsed on the server from text the page already read, so no file is
// stored anywhere. Every parsed row goes through the SAME shared ingestion as a
// provider sync (dedupe by external_id + fingerprint, category and gathering
// suggestions), and lands as a review suggestion — nothing becomes an Expense
// here.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectionId = String(body.connection_id || '');
    const content = typeof body.content === 'string' ? body.content : '';

    if (!connectionId) {
      return Response.json({ error: 'Choose an account', reason: 'missing_connection' }, { status: 400 });
    }
    if (!content.trim()) {
      return Response.json({ error: 'The statement is empty', reason: 'empty_statement' }, { status: 400 });
    }
    if (content.length > STATEMENT_MAX_CHARS) {
      return Response.json({ error: 'This statement is too large', reason: 'statement_too_large' }, { status: 413 });
    }

    const connection = await base44.asServiceRole.entities.FinancialConnection
      .get(connectionId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!connection) return Response.json({ error: 'Account not found' }, { status: 404 });
    if (connection.target_user_id !== user.id) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (connection.status === 'disconnected') {
      return Response.json({ error: 'This account is disconnected', reason: 'disconnected' }, { status: 400 });
    }
    if (connection.provider !== 'import') {
      return Response.json({
        error: 'This account is synced by its provider',
        reason: 'not_an_import_account',
      }, { status: 400 });
    }

    const parsed = parseStatement(content);
    if (!parsed.rows.length) {
      return Response.json({
        error: 'No transactions found in this statement',
        reason: parsed.warnings[0] || 'no_rows',
        warnings: parsed.warnings,
        skipped: parsed.skipped,
      }, { status: 422 });
    }

    const ranges = await loadGatheringRanges(base44, user.id);
    const ingested = await ingestTransactions(base44, {
      user,
      connection,
      rawRows: parsed.rows,
      source: 'statement_import',
      ranges,
    });

    const now = new Date().toISOString();
    await base44.asServiceRole.entities.FinancialConnection.update(connection.id, {
      last_attempt_at: now,
      last_sync_at: now,
      status: 'connected',
      last_error: '',
    });

    return Response.json({
      parsed: parsed.rows.length,
      imported: ingested.imported,
      duplicates: ingested.duplicates,
      upgraded: ingested.upgraded,
      rejected: ingested.rejected,
      skipped: parsed.skipped,
      warnings: parsed.warnings,
      format: parsed.format,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}