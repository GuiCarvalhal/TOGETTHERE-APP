import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  SYNC_INTERVALS,
  connectionDueMs,
  listUserConnections,
  normalizeSyncInterval,
  sanitizeConnection,
} from '../../shared/inboxConnectors.ts';

// Per-mailbox settings: sync cadence and the display label shown on the card.
// Ownership is enforced by looking the connection up among the caller's own
// rows — a connection id belonging to someone else is simply "not found".
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const connectionId = typeof body?.connection_id === 'string' ? body.connection_id.trim() : '';
    if (!connectionId) return Response.json({ error: 'connection_id_required' }, { status: 400 });

    const connections = await listUserConnections(base44, user);
    const connection = (connections || []).find((c) => c.id === connectionId);
    if (!connection) return Response.json({ error: 'connection_not_found' }, { status: 404 });

    const patch = { updated_at: new Date().toISOString() };

    if (body?.sync_interval_minutes !== undefined) {
      const requested = Number(body.sync_interval_minutes);
      if (!SYNC_INTERVALS.includes(requested)) {
        return Response.json({ error: 'invalid_interval', allowed: SYNC_INTERVALS }, { status: 400 });
      }
      patch.sync_interval_minutes = requested;
      // Re-anchor the next eligible check to the new cadence right away.
      const dueMs = connectionDueMs({ ...connection, sync_interval_minutes: requested });
      patch.next_sync_at = dueMs > 0 ? new Date(dueMs).toISOString() : '';
    }

    if (body?.display_label !== undefined) {
      const label = String(body.display_label || '').trim().slice(0, 60);
      patch.display_label = label;
    }

    if (Object.keys(patch).length === 1) {
      return Response.json({ error: 'nothing_to_update' }, { status: 400 });
    }

    const updated = await base44.asServiceRole.entities.InboxConnection.update(connection.id, patch);
    return Response.json({
      ok: true,
      connection: sanitizeConnection({ ...connection, ...patch, ...(updated || {}) }),
      sync_intervals: SYNC_INTERVALS,
      default_interval: normalizeSyncInterval(patch.sync_interval_minutes ?? connection.sync_interval_minutes),
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not update the connection' }, { status: 500 });
  }
}