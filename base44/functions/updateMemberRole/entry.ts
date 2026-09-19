import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, syncChildArrays } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, member_id, role } = body;
    if (!gathering_id || !member_id || !role) return Response.json({ error: 'gathering_id, member_id and role required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') {
      return Response.json({ error: 'Only the gathering owner can change roles' }, { status: 403 });
    }
    await base44.asServiceRole.entities.Member.update(member_id, { role });
    await syncChildArrays(base44, gathering_id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}