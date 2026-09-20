import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { notifyUsers, isOneSignalConfigured } from '../../shared/onesignal.ts';

// Owner-only: sends a test push to the owner's own device to verify setup.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') {
      return Response.json({ error: 'Only the owner can send a test notification' }, { status: 403 });
    }
    if (!isOneSignalConfigured()) {
      return Response.json({ error: 'Push notifications are not configured' }, { status: 503 });
    }

    const origin = req.headers.get('origin') || '';
    const route = `/gathering/${gathering_id}/journey`;
    const result = await notifyUsers(base44, {
      gatheringId: gathering_id,
      userIds: [user.id],
      category: 'members',
      heading: 'TOGETTHERE test',
      message: `Hi ${me.full_name || 'there'} — this is a test notification. Push is working!`,
      data: { gathering_id, route, kind: 'test' },
      url: origin ? origin + route : undefined,
      dedupKey: `test:${gathering_id}:${user.id}`,
      enforcePrefs: false,
    });

    if (!result.ok) return Response.json({ error: result.error || 'Delivery failed' }, { status: 502 });
    return Response.json({ ok: true, sent: result.sent, reason: result.reason || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}