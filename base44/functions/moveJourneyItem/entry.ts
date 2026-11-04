import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { getMyMember, allMemberUserIds, participantUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';

// Moves one journey segment from its gathering into another one.
//
// Moving is an EDIT, so the same permission as editing applies in the source
// gathering, plus the user must be a participant (never a viewer) of the target.
// Everything gathering-scoped is rebuilt for the destination in one write:
// owner_user_id (destination owner), member_user_ids (destination ACL) and
// attendee_user_ids — reconciled with the destination roster so no participant
// survives that is no longer part of the gathering that owns the segment.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const itemId = typeof body?.item_id === 'string' ? body.item_id.trim() : '';
    const targetId = typeof body?.target_gathering_id === 'string' ? body.target_gathering_id.trim() : '';
    if (!itemId || !targetId) {
      return Response.json({ error: 'item_id and target_gathering_id required' }, { status: 400 });
    }

    const existing = await base44.asServiceRole.entities.JourneyItem.get(itemId).catch(() => null);
    if (!existing) return Response.json({ error: 'Segment not found' }, { status: 404 });
    const sourceId = existing.gathering_id;
    if (!sourceId) return Response.json({ error: 'Segment not found' }, { status: 404 });
    if (sourceId === targetId) return Response.json({ ok: true, unchanged: true, removed_participants: 0 });

    const sourceMe = await getMyMember(base44, sourceId, user.id);
    if (!sourceMe || sourceMe.role === 'viewer') {
      return Response.json({ error: 'Only participants can move journey segments' }, { status: 403 });
    }
    const canEdit =
      existing.owner_id === user.id ||
      existing.owner_user_id === user.id ||
      sourceMe.role === 'owner' ||
      sourceMe.role === 'admin';
    if (!canEdit) return Response.json({ error: 'You can only move your own segments' }, { status: 403 });

    const targetMe = await getMyMember(base44, targetId, user.id);
    if (!targetMe || targetMe.role === 'viewer') {
      return Response.json(
        { error: 'You can only move segments into gatherings you take part in' },
        { status: 403 }
      );
    }

    const [targetGathering, targetMembers, sourceGathering, sourceMembers] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(targetId).catch(() => null),
      base44.asServiceRole.entities.Member.filter({ gathering_id: targetId }),
      base44.asServiceRole.entities.Gathering.get(sourceId).catch(() => null),
      base44.asServiceRole.entities.Member.filter({ gathering_id: sourceId }),
    ]);
    if (!targetGathering) return Response.json({ error: 'Destination gathering not found' }, { status: 404 });

    // A Main Event can exist at most once per gathering — moving one into a
    // gathering that already has one would create a second.
    if (existing.type === 'main_event') {
      const targetMain = await base44.asServiceRole.entities.JourneyItem.filter({
        gathering_id: targetId,
        type: 'main_event',
      });
      if (Array.isArray(targetMain) && targetMain.length > 0) {
        return Response.json(
          { error: 'The destination gathering already has a Main Event.' },
          { status: 409 }
        );
      }
    }

    const ownerUid = gatheringOwnerUserId(targetGathering, targetMembers);
    const memberUserIds = allMemberUserIds(targetMembers);
    const participants = new Set(participantUserIds(targetMembers));

    const before = Array.isArray(existing.attendee_user_ids) ? existing.attendee_user_ids : [];
    const kept = before.filter((id: string) => participants.has(id));
    // The creator stays an attendee only while they take part in the destination.
    const keepOwner = existing.owner_id && participants.has(existing.owner_id) ? [existing.owner_id] : [];
    const attendees = [...new Set([...keepOwner, ...kept])].filter(Boolean);
    const removed = before.filter((id: string) => !attendees.includes(id)).length;

    await base44.asServiceRole.entities.JourneyItem.update(itemId, {
      gathering_id: targetId,
      owner_user_id: ownerUid,
      member_user_ids: memberUserIds,
      attendee_user_ids: attendees,
    });

    const actorName = targetMe.full_name || sourceMe.full_name || user.full_name || 'Someone';
    const title = existing.title || 'a segment';
    await logActivity(base44, {
      gatheringId: targetId,
      type: 'journey_added',
      actorUserId: user.id,
      actorName,
      summary: `${actorName} moved "${title}" into this gathering`,
      ownerUserId: ownerUid,
      participantUserIds: memberUserIds,
    }).catch(() => {});
    await logActivity(base44, {
      gatheringId: sourceId,
      type: 'journey_added',
      actorUserId: user.id,
      actorName,
      summary: `${actorName} moved "${title}" to ${targetGathering.name || 'another gathering'}`,
      ownerUserId: sourceGathering ? gatheringOwnerUserId(sourceGathering, sourceMembers) : undefined,
      participantUserIds: allMemberUserIds(sourceMembers),
    }).catch(() => {});

    return Response.json({ ok: true, removed_participants: removed, gathering_id: targetId });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not move this segment' }, { status: 500 });
  }
}