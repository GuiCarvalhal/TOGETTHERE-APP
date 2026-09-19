import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember, syncChildArrays } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, member_id } = body;
    if (!gathering_id || !member_id) return Response.json({ error: 'gathering_id and member_id required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') {
      return Response.json({ error: 'Only the gathering owner can remove members' }, { status: 403 });
    }
    if (member_id === me.id) {
      return Response.json({ error: 'Transfer ownership before removing yourself' }, { status: 400 });
    }
    await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ member_id: member_id });
    await base44.asServiceRole.entities.Member.delete(member_id);
    await syncChildArrays(base44, gathering_id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}