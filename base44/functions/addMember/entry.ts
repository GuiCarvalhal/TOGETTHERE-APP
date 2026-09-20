import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, gatheringOwnerUserId, syncChildArrays } from '../../shared/gatheringAcl.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, full_name, role, home_city } = body;
    if (!gathering_id || !full_name) return Response.json({ error: 'gathering_id and full_name required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
      return Response.json({ error: 'Only the owner or an admin can add members' }, { status: 403 });
    }
    const allowedRoles = ['admin', 'member', 'viewer'];
    const finalRole = allowedRoles.includes(role) ? role : 'member';
    const gathering = await base44.asServiceRole.entities.Gathering.get(gathering_id);
    const ownerUid = gatheringOwnerUserId(gathering, [me]);

    await base44.asServiceRole.entities.Member.create({
      gathering_id,
      user_id: `pending-${Date.now()}`,
      role: finalRole,
      full_name,
      home_city: home_city || '',
      owner_user_id: ownerUid,
    });
    await syncChildArrays(base44, gathering_id);
    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/members`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'members', excludeUserIds: [user.id],
        heading: 'New member added',
        message: `${me.full_name || 'Someone'} added ${full_name} to the gathering.`,
        data: { gathering_id, route, kind: 'member_added' },
        url: origin ? origin + route : undefined,
        dedupKey: `member_added:${gathering_id}:${full_name}`,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}