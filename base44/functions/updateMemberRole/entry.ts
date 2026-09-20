import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, syncChildArrays } from '../../shared/gatheringAcl.ts';
import { notifyUsers, isOneSignalConfigured } from '../../shared/onesignal.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, member_id, role } = body;
    if (!gathering_id || !member_id || !role) return Response.json({ error: 'gathering_id, member_id and role required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
      return Response.json({ error: 'Only the owner or an admin can change roles' }, { status: 403 });
    }
    const allowedRoles = ['owner', 'admin', 'member', 'viewer'];
    if (!allowedRoles.includes(role)) {
      return Response.json({ error: 'Invalid role' }, { status: 400 });
    }
    const target = await base44.asServiceRole.entities.Member.get(member_id);
    if (!target || target.gathering_id !== gathering_id) {
      return Response.json({ error: 'Member not found' }, { status: 404 });
    }
    if (me.role === 'admin') {
      if (target.role === 'owner') {
        return Response.json({ error: 'Admins cannot change the Owner' }, { status: 403 });
      }
      if (role === 'owner') {
        return Response.json({ error: 'Only the Owner can transfer ownership' }, { status: 403 });
      }
    }
    await base44.asServiceRole.entities.Member.update(member_id, { role });
    await syncChildArrays(base44, gathering_id);
    if (isOneSignalConfigured() && target.user_id && !target.user_id.startsWith('pending-')) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/members`;
      const roleLabel = { owner: 'Owner', admin: 'Admin (co-organizer)', member: 'Member', viewer: 'Viewer' }[role] || role;
      await notifyUsers(base44, {
        gatheringId: gathering_id, userIds: [target.user_id], category: 'members',
        heading: 'Your role changed',
        message: `You're now ${roleLabel} in this gathering.`,
        data: { gathering_id, route, kind: 'role_changed' },
        url: origin ? origin + route : undefined,
        dedupKey: `role_changed:${target.user_id}:${role}`,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}