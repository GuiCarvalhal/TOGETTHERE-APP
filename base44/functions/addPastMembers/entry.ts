import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';
import { addPastMembersToGathering } from '../../shared/pastMembers.ts';
import { logActivity } from '../../shared/logActivity.ts';

// Adds selected previous travel companions to this gathering immediately, with
// the same member defaults the invite-link join uses (role "member", owner ACL
// stamped, child arrays synced). Idempotent: whoever is already a member is
// skipped, and concurrent duplicates collapse to one row per account.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { gathering_id, user_ids } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    if (!Array.isArray(user_ids) || !user_ids.length) {
      return Response.json({ error: 'user_ids required' }, { status: 400 });
    }

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
      return Response.json({ error: 'Only the owner or an admin can add members' }, { status: 403 });
    }

    const gathering = await base44.asServiceRole.entities.Gathering.get(gathering_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });
    const ownerUid = gatheringOwnerUserId(gathering, [me]);

    const { added, skipped, failed } = await addPastMembersToGathering(base44, {
      gatheringId: gathering_id,
      actorUserId: user.id,
      ownerUid,
      userIds: user_ids,
    });

    if (added.length) {
      const { parts } = await syncChildArrays(base44, gathering_id);
      const names = added.map((a) => a.full_name).filter(Boolean);
      await logActivity(base44, {
        gatheringId: gathering_id,
        type: 'member_added',
        actorUserId: user.id,
        actorName: me.full_name || 'The host',
        summary: `${me.full_name || 'The host'} added ${names.join(', ')} to the gathering`,
        ownerUserId: ownerUid,
        participantUserIds: parts,
      });
    }

    return Response.json({ added, skipped, failed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}