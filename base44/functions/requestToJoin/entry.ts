import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    const requestedRole = body.requested_role === 'viewer' ? 'viewer' : 'member';
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    const gathering = await base44.asServiceRole.entities.Gathering.get(gatheringId);
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });
    const me = await getMyMember(base44, gatheringId, user.id);
    if (me) return Response.json({ status: 'already_member', role: me.role });
    const mode = gathering.privacy_mode || 'invite';
    const ownerUid = gatheringOwnerUserId(gathering, []);
    const displayName = user.full_name || (user.email ? user.email.split('@')[0] : 'Traveler');

    if (mode === 'invite') {
      return Response.json({ status: 'invite_only' });
    }
    if (mode === 'open') {
      await base44.asServiceRole.entities.Member.create({
        gathering_id: gatheringId,
        user_id: user.id,
        role: requestedRole,
        full_name: displayName,
        owner_user_id: ownerUid,
      });
      await syncChildArrays(base44, gatheringId);
      return Response.json({ status: 'joined', role: requestedRole });
    }
    // approval-required
    const existing = await base44.asServiceRole.entities.JoinRequest.filter({ gathering_id: gatheringId, user_id: user.id });
    if ((existing || []).some((r) => r.status === 'pending')) {
      return Response.json({ status: 'pending' });
    }
    await base44.asServiceRole.entities.JoinRequest.create({
      gathering_id: gatheringId,
      user_id: user.id,
      full_name: displayName,
      email: user.email || '',
      requested_role: requestedRole,
      status: 'pending',
      owner_user_id: ownerUid,
      participant_user_ids: gathering.participant_user_ids || [],
    });
    return Response.json({ status: 'requested' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}