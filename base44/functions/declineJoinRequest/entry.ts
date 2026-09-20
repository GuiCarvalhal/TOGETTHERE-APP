import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { notifyUsers, isOneSignalConfigured } from '../../shared/onesignal.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, request_id } = body;
    if (!gathering_id || !request_id) return Response.json({ error: 'gathering_id and request_id required' }, { status: 400 });
    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') return Response.json({ error: 'Only the owner can decline requests' }, { status: 403 });
    const jr = await base44.asServiceRole.entities.JoinRequest.get(request_id);
    if (!jr || jr.gathering_id !== gathering_id) return Response.json({ error: 'Request not found' }, { status: 404 });
    await base44.asServiceRole.entities.JoinRequest.update(request_id, { status: 'declined' });
    if (isOneSignalConfigured() && jr.user_id) {
      const origin = req.headers.get('origin') || '';
      await notifyUsers(base44, {
        gatheringId: gathering_id, userIds: [jr.user_id], category: 'members',
        heading: 'Join request declined',
        message: `Your request to join this gathering was declined.`,
        data: { gathering_id, route: '/', kind: 'join_declined' },
        url: origin ? origin + '/' : undefined,
        dedupKey: `join_declined:${jr.user_id}`,
      });
    }
    return Response.json({ status: 'declined' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}