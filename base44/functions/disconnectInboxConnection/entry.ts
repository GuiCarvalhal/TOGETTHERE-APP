import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { disconnectingConnection, isInboxProvider, listUserConnections } from '../../shared/inboxConnectors.ts';

// Turns mailbox connections off and wipes their stored tokens. Imports already
// created by a connection stay in the user's Journey.
//   { connection_id } -> that one mailbox
//   { provider }      -> every mailbox of that provider (kept for compatibility
//                        with clients that predate multi-account support)
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connection_id === 'string' ? body.connection_id.trim() : '';
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';

    const connections = await listUserConnections(base44, user);

    let targets = [];
    if (connectionId) {
      targets = (connections || []).filter((c) => c.id === connectionId);
      if (!targets.length) return Response.json({ error: 'connection_not_found' }, { status: 404 });
    } else if (provider && isInboxProvider(provider)) {
      targets = (connections || []).filter((c) => c.provider === provider && c.status !== 'disconnected');
      if (!targets.length) return Response.json({ error: 'Not connected' }, { status: 404 });
    } else {
      return Response.json({ error: 'connection_id_required' }, { status: 400 });
    }

    for (const connection of targets) {
      await disconnectingConnection(base44, connection);
    }

    return Response.json({
      ok: true,
      disconnected: targets.length,
      ids: targets.map((c) => c.id),
      provider: provider || targets[0].provider,
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not disconnect' }, { status: 500 });
  }
}