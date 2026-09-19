import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';

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
    await syncChildArrays(base44, gathering_id);
    return Response.json({ status: 'approved', role });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}