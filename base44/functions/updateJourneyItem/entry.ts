import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, allMemberUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, item_id, payload } = body;
    if (!gathering_id || !item_id || !payload) return Response.json({ error: 'gathering_id, item_id and payload required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') return Response.json({ error: 'Only participants can edit journey segments' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.JourneyItem.get(item_id);
    if (!existing || existing.gathering_id !== gathering_id) return Response.json({ error: 'Segment not found' }, { status: 404 });
    const canEdit =
      existing.owner_id === user.id ||
      existing.owner_user_id === user.id ||
      me.role === 'owner' ||
      me.role === 'admin';
    if (!canEdit) return Response.json({ error: 'You can only edit your own segments' }, { status: 403 });

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const memberUserIds = allMemberUserIds(members);

    await base44.asServiceRole.entities.JourneyItem.update(item_id, {
      ...payload,
      gathering_id,
      owner_id: existing.owner_id,
      owner_user_id: ownerUid,
      member_user_ids: memberUserIds,
    });

    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} updated "${payload.title || existing.title}" in the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/journey`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'journey', excludeUserIds: [user.id],
        heading: 'Journey updated',
        message: `${me.full_name || 'Someone'} updated "${payload.title || existing.title}".`,
        data: { gathering_id, route, kind: 'journey_updated' },
        url: origin ? origin + route : undefined,
        dedupKey: `journey_updated:${item_id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}