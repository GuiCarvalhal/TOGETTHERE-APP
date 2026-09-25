import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { gatheringOwnerUserId, participantUserIds } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';

// Set the current user's one-directional sharing level (close | casual) toward
// a target user. The relationship is global (owner_user_id + target_user_id),
// reused across gatherings; the activity log is scoped to the calling gathering.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, target_user_id, level } = body;
    if (!gathering_id || !target_user_id) return Response.json({ error: 'gathering_id and target_user_id required' }, { status: 400 });
    if (level !== 'close' && level !== 'casual') return Response.json({ error: 'level must be close or casual' }, { status: 400 });
    if (target_user_id === user.id) return Response.json({ error: 'Cannot set a relationship to yourself' }, { status: 400 });

    // Upsert the Relationship record (owner = current user, target = target_user_id).
    // User-scoped CRUD works here: read allows owner OR target; write allows owner.
    const existing = await base44.entities.Relationship.filter({ owner_user_id: user.id, target_user_id });
    const wasClose = existing && existing[0] && existing[0].level === 'close';
    if (existing && existing[0]) {
      await base44.entities.Relationship.update(existing[0].id, { level });
    } else {
      await base44.entities.Relationship.create({ owner_user_id: user.id, target_user_id, level });
    }

    // Log a "marked close" activity in the gathering when newly close (mirrors the
    // legacy updateMyProfile behavior so the activity feed keeps working).
    if (level === 'close' && !wasClose) {
      const [members, gathering] = await Promise.all([
        base44.asServiceRole.entities.Member.filter({ gathering_id }),
        base44.asServiceRole.entities.Gathering.get(gathering_id),
      ]);
      const me = (members || []).find((m) => m.user_id === user.id);
      const target = (members || []).find((m) => m.user_id === target_user_id);
      const parts = participantUserIds(members);
      const ownerUid = gatheringOwnerUserId(gathering, members);
      await logActivity(base44, {
        gatheringId: gathering_id, type: 'relationship_close',
        actorUserId: user.id, actorName: me?.full_name || user.full_name || 'Someone',
        summary: `${me?.full_name || 'Someone'} marked ${target?.full_name || 'a member'} as close`,
        ownerUserId: ownerUid, participantUserIds: parts,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}