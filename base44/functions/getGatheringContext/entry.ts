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

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
    ]);
    const me = (members || []).find((m) => m.user_id === user.id) || null;
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });

    const relationships = me.relationships || {};
    const masked = (members || []).map((m) => {
      if (m.user_id === user.id) {
        return { ...m, visibility: 'full', myRelationship: null };
      }
      const rel = relationships[m.user_id] || 'casual';
      if (me.role === 'owner' || rel === 'close') {
        return { ...m, visibility: 'full', myRelationship: rel };
      }
      const { contact_info, arrival_date, departure_date, private_notes, ...rest } = m;
      return {
        ...rest,
        contact_info: null,
        arrival_date: null,
        departure_date: null,
        private_notes: null,
        visibility: 'limited',
        myRelationship: rel,
      };
    });

    let joinRequests = [];
    if (me.role === 'owner') {
      joinRequests = await base44.asServiceRole.entities.JoinRequest.filter({ gathering_id: gatheringId, status: 'pending' }) || [];
    }
    return Response.json({ gathering, currentMember: me, members: masked, joinRequests });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}