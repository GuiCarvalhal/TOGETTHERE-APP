import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, request_id } = body;
    if (!gathering_id || !request_id) return Response.json({ error: 'gathering_id and request_id required' }, { status: 400 });
    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') return Response.json({ error: 'Only the owner can decline requests' }, { status: 403 });
    await base44.asServiceRole.entities.JoinRequest.update(request_id, { status: 'declined' });
    return Response.json({ status: 'declined' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}