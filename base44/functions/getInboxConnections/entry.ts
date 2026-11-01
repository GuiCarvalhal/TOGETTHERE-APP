import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  SYNC_INTERVALS,
  inboxProviderConfigStatus,
  listUserConnections,
  sanitizeConnection,
} from '../../shared/inboxConnectors.ts';

// Returns the signed-in user's mailbox connections (one entry per mailbox, so a
// user may have several per provider) without any token material, plus which
// providers are configured and the allowed cadences so the UI stays in sync
// with the server's rules.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const connections = await listUserConnections(base44, user);

    return Response.json({
      connections: (connections || []).map(sanitizeConnection),
      configured: inboxProviderConfigStatus(),
      sync_intervals: SYNC_INTERVALS,
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not load inbox connections' }, { status: 500 });
  }
}