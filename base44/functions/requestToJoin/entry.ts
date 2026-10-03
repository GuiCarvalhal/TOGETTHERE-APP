import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';

// Joining a gathering is now done exclusively through sharing links. Either
// link joins immediately after authentication — there is no approval/invite-only
// gating, and legacy privacy_mode values are ignored (old gatherings behave as
// open through their existing valid links). The role is determined securely by
// the link: a viewer link (?as=viewer) only ever grants the viewer role; a
// member link grants member. An existing member is never re-joined and never
// has their role changed by clicking a link. Memberships, roles, owners and
// pending JoinRequest records are never destroyed here.
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
    const ownerUid = gatheringOwnerUserId(gathering, []);
    const displayName = user.full_name || (user.email ? user.email.split('@')[0] : 'Traveler');

    await base44.asServiceRole.entities.Member.create({
      gathering_id: gatheringId,
      user_id: user.id,
      role: requestedRole,
      full_name: displayName,
      owner_user_id: ownerUid,
    });
    const { parts } = await syncChildArrays(base44, gatheringId);
    await logActivity(base44, {
      gatheringId, type: 'member_added',
      actorUserId: user.id, actorName: displayName,
      summary: `${displayName} joined the gathering`,
      ownerUserId: ownerUid, participantUserIds: parts,
    });
    return Response.json({ status: 'joined', role: requestedRole });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}