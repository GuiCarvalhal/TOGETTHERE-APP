import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { matchMyMember, healMember, syncChildArrays } from '../../shared/gatheringAcl.ts';

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
    let me = matchMyMember(members, user);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });
    // Self-heal beta-imported member records to the real app user id.
    if (me.user_id !== user.id) {
      me = await healMember(base44, me, user);
    }
    // Sync denormalized ACL arrays if the current user's app id isn't reflected yet
    // (handles both just-healed and previously-healed-but-unsynced gatherings).
    if (!(gathering.member_user_ids || []).includes(user.id)) {
      await syncChildArrays(base44, gatheringId);
    }

    const relationships = me.relationships || {};
    const masked = (members || []).map((m) => {
      if (m.id === me.id) {
        return { ...me, visibility: 'full', myRelationship: null };
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