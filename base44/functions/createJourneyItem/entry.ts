import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, allMemberUserIds, participantUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

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
    const participantUids = new Set(participantUserIds(members));

    // Attendee selection from the form: validate that every requested id is a
    // current PARTICIPANT (owner/member) — viewers can never be added to a
    // segment's opt-in attendee list, even via a crafted request. The creator
    // is always included (they're a participant — viewers are blocked above).
    // member_user_ids (the ACL read list) still includes all members.
    const requestedAttendees = Array.isArray(payload.attendee_user_ids)
      ? payload.attendee_user_ids.filter((id) => participantUids.has(id))
      : [];
    const attendeeUserIds = [...new Set([user.id, ...requestedAttendees])];
    const created = await base44.asServiceRole.entities.JourneyItem.create({
      ...payload,
      gathering_id,
      owner_id: user.id,
      owner_user_id: ownerUid,
      member_user_ids: memberUserIds,
      attendee_user_ids: attendeeUserIds,
    });
    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} added "${payload.title}" to the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });
    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/journey`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'journey', excludeUserIds: [user.id],
        heading: 'New journey segment',
        message: `${me.full_name || 'Someone'} added "${payload.title}" to the journey.`,
        data: { gathering_id, route, kind: 'journey_added' },
        url: origin ? origin + route : undefined,
        dedupKey: `journey_added:${created.id}`,
      });
    }
    return Response.json({ item: created });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}