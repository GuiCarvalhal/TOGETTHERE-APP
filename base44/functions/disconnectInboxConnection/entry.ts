import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { disconnectingConnection, isInboxProvider, listUserConnections } from '../../shared/inboxConnectors.ts';

// Turns a mailbox connection off and wipes its stored tokens. Imports already
// created by the connection stay in the user's Journey.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    if (!isInboxProvider(provider)) {
      return Response.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const connections = await listUserConnections(base44, user);
    const connection = (connections || []).find((c) => c.provider === provider);
    if (!connection) return Response.json({ error: 'Not connected' }, { status: 404 });

    await disconnectingConnection(base44, connection);

    return Response.json({ ok: true, provider, status: 'disconnected' });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not disconnect' }, { status: 500 });
  }
}