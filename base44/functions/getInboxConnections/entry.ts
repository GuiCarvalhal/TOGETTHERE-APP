import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  inboxProviderConfigStatus,
  listUserConnections,
  sanitizeConnection,
} from '../../shared/inboxConnectors.ts';

// Returns the signed-in user's mailbox connections without any token material,
// plus which providers currently have OAuth credentials configured so the UI
// can disable Connect instead of sending the user into a dead end.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const connections = await listUserConnections(base44, user);

    return Response.json({
      connections: (connections || []).map(sanitizeConnection),
      configured: inboxProviderConfigStatus(),
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not load inbox connections' }, { status: 500 });
  }
}