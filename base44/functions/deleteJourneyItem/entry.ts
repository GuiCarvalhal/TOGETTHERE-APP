import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember, gatheringOwnerUserId, allMemberUserIds } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

// Delete a journey segment. Runs as the service role (bypassing RLS) so the
// permission can be enforced explicitly — the JourneyItem RLS delete rule
// can't express "gathering admin", so a direct client delete silently 403s for
// anyone not matching owner_id/owner_user_id/app-admin. This function makes
// denials explicit (403 with a message) and keeps the rule intact: only the
// item creator, the gathering owner, or an app admin may delete.
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

    const existing = await base44.asServiceRole.entities.JourneyItem.get(item_id);
    if (!existing || existing.gathering_id !== gathering_id) return Response.json({ error: 'Segment not found' }, { status: 404 });

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const memberUserIds = allMemberUserIds(members);

    // Delete permission: item creator OR gathering owner OR app admin.
    // (Gathering admins can edit but not delete — delete is creator/owner only.)
    const canDelete =
      existing.owner_id === user.id ||
      ownerUid === user.id ||
      user.role === 'admin';
    if (!canDelete) return Response.json({ error: 'Only the creator or the gathering owner can delete this segment' }, { status: 403 });

    await base44.asServiceRole.entities.JourneyItem.delete(item_id);

    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} removed "${existing.title}" from the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/journey`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'journey', excludeUserIds: [user.id],
        heading: 'Journey segment removed',
        message: `${me.full_name || 'Someone'} removed "${existing.title}" from the journey.`,
        data: { gathering_id, route, kind: 'journey_deleted' },
        url: origin ? origin + route : undefined,
        dedupKey: `journey_deleted:${item_id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}