import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { restorePatch } from '../../shared/softDelete.ts';

// Restore a journey segment from Recently deleted. Mirrors deleteJourneyItem's
// permission model (item creator, gathering owner, app admin) so whoever could
// move it out can put it back. The record itself is untouched apart from the
// soft-delete flags, so it returns to its original date group, gathering
// membership, attendees and attachments.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, item_id } = body;
    if (!gathering_id || !item_id) return Response.json({ error: 'gathering_id and item_id required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.JourneyItem.get(item_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!existing || existing.gathering_id !== gathering_id) return Response.json({ error: 'Segment not found' }, { status: 404 });
    if (!existing.is_deleted) return Response.json({ ok: true, already_active: true });

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const canRestore =
      existing.owner_id === user.id ||
      existing.deleted_by === user.id ||
      ownerUid === user.id ||
      user.role === 'admin';
    if (!canRestore) return Response.json({ error: 'Only the creator or the gathering owner can restore this segment' }, { status: 403 });

    await base44.asServiceRole.entities.JourneyItem.update(item_id, restorePatch());

    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} restored "${existing.title}" to the journey`,
      ownerUserId: ownerUid, participantUserIds: members.map((m) => m.user_id).filter(Boolean),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}