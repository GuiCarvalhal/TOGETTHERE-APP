import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isInboxProvider, syncUserConnections } from '../../shared/inboxConnectors.ts';

// Syncs mailbox connections for the signed-in user.
//   { connection_id } -> exactly that mailbox
//   { provider }      -> every mailbox of that provider
//   {}                -> every mailbox (batch)
// `force` is what "Sync now" sends: it ignores the cadence, never the in-flight
// lease, so two taps cannot double-sync the same mailbox.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connection_id === 'string' ? body.connection_id.trim() : '';
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    if (provider && !isInboxProvider(provider)) {
      return Response.json({ error: 'Invalid provider' }, { status: 400 });
    }

    let results;
    try {
      results = await syncUserConnections(base44, user, {
        connectionId,
        provider,
        force: Boolean(body?.force),
      });
    } catch (error: any) {
      if (error?.message === 'connection_not_found') {
        return Response.json({ error: 'connection_not_found' }, { status: 404 });
      }
      throw error;
    }

    const summary = results.reduce((acc, r) => ({
      connections: acc.connections + 1,
      synced: acc.synced + (r.ok ? 1 : 0),
      imported: acc.imported + (Number(r.ingested) || 0),
      skipped: acc.skipped + (r.skipped ? 1 : 0),
      failed: acc.failed + (r.ok === false ? 1 : 0),
    }), { connections: 0, synced: 0, imported: 0, skipped: 0, failed: 0 });

    return Response.json({ ok: true, results, summary });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}