import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, allMemberUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, payload } = body;
    if (!gathering_id || !payload) return Response.json({ error: 'gathering_id and payload required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') {
      return Response.json({ error: 'Only participants can add journey segments' }, { status: 403 });
    }
    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const memberUserIds = allMemberUserIds(members);

    const created = await base44.asServiceRole.entities.JourneyItem.create({
      ...payload,
      gathering_id,
      owner_id: user.id,
      owner_user_id: ownerUid,
      member_user_ids: memberUserIds,
    });
    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} added "${payload.title}" to the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });
    return Response.json({ item: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}