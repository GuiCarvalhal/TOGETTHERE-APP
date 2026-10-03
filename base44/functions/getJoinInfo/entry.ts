import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    const gathering = await base44.asServiceRole.entities.Gathering.get(gatheringId);
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });
    const me = await getMyMember(base44, gatheringId, user.id);
    let pending = null;
    if (!me) {
      const reqs = await base44.asServiceRole.entities.JoinRequest.filter({ gathering_id: gatheringId, user_id: user.id });
      pending = (reqs || []).find((r) => r.status === 'pending') || null;
    }
    return Response.json({
      gathering: {
        id: gathering.id,
        name: gathering.name,
        cover_image: gathering.cover_image,
        start_date: gathering.start_date,
        end_date: gathering.end_date,
        destinations: gathering.destinations,
        description: gathering.description,
        status: gathering.status,
      },
      isMember: !!me,
      role: me ? me.role : null,
      pendingRequest: pending,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}