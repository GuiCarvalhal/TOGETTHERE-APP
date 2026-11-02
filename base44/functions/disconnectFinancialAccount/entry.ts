import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Turns a financial connection off. The imported transactions and their links
// stay (they are the user's records); the connection stops syncing and any
// provider reference is cleared so nothing can re-fetch it.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (!body.connection_id) return Response.json({ error: 'connection_id required' }, { status: 400 });

    const connection = await base44.asServiceRole.entities.FinancialConnection.get(body.connection_id);
    if (!connection) return Response.json({ error: 'Connection not found' }, { status: 404 });
    if (connection.target_user_id !== user.id) {
      return Response.json({ error: 'Not allowed' }, { status: 403 });
    }

    await base44.asServiceRole.entities.FinancialConnection.update(connection.id, {
      status: 'disconnected',
      provider_item_ref: '',
      last_error: '',
      disabled_at: new Date().toISOString(),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}