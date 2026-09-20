import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
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
    if (!me || me.role !== 'owner') return Response.json({ error: 'Only the owner can approve requests' }, { status: 403 });
    const jr = await base44.asServiceRole.entities.JoinRequest.get(request_id);
    if (!jr || jr.gathering_id !== gathering_id) return Response.json({ error: 'Request not found' }, { status: 404 });
    if (jr.status !== 'pending') return Response.json({ error: 'Request already resolved' }, { status: 400 });
    const gathering = await base44.asServiceRole.entities.Gathering.get(gathering_id);
    const ownerUid = gatheringOwnerUserId(gathering, [me]);
    const role = jr.requested_role === 'viewer' ? 'viewer' : 'member';
    const existing = await getMyMember(base44, gathering_id, jr.user_id);
    if (existing) {
      await base44.asServiceRole.entities.JoinRequest.update(request_id, { status: 'approved' });
      return Response.json({ status: 'already_member' });
    }
    await base44.asServiceRole.entities.Member.create({
      gathering_id,
      user_id: jr.user_id,
      role,
      full_name: jr.full_name,
      owner_user_id: ownerUid,
    });
    await base44.asServiceRole.entities.JoinRequest.update(request_id, { status: 'approved' });
    const { parts } = await syncChildArrays(base44, gathering_id);
    await logActivity(base44, {
      gatheringId: gathering_id, type: 'join_approved',
      actorUserId: user.id, actorName: me.full_name || 'The host',
      summary: `${me.full_name || 'The host'} approved ${jr.full_name || 'a traveler'}'s request to join`,
      ownerUserId: ownerUid, participantUserIds: parts,
    });
    if (isOneSignalConfigured() && jr.user_id) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/journey`;
      await notifyUsers(base44, {
        gatheringId: gathering_id, userIds: [jr.user_id], category: 'members',
        heading: "You're in!",
        message: `${me.full_name || 'The host'} approved your request to join ${gathering.name}.`,
        data: { gathering_id, route, kind: 'join_approved' },
        url: origin ? origin + route : undefined,
        dedupKey: `join_approved:${jr.user_id}`,
      });
    }
    return Response.json({ status: 'approved', role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}