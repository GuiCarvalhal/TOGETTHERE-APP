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

    const [gathering, members, journeyItemsRaw] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId }),
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

    // Reciprocal close/casual trust from the Relationship entity (with a
    // Member.relationships fallback for legacy data). Deep trust (both close)
    // or viewer-is-owner => full; otherwise limited.
    const [relsOut, relsIn] = await Promise.all([
      base44.asServiceRole.entities.Relationship.filter({ owner_user_id: user.id }).catch(() => []),
      base44.asServiceRole.entities.Relationship.filter({ target_user_id: user.id }).catch(() => []),
    ]);
    const outMap = {}; (relsOut || []).forEach((r) => { outMap[r.target_user_id] = r.level; });
    const inMap = {}; (relsIn || []).forEach((r) => { inMap[r.owner_user_id] = r.level; });
    const myRels = me.relationships || {};

    // Enrich my member record with global User profile fields so my card and the
    // Agent reflect the global profile (home_city, interests).
    me = { ...me, home_city: user.home_city || me.home_city, interests: (user.interests && user.interests.length) ? user.interests : me.interests };

    const masked = (members || []).map((m) => {
      if (m.id === me.id) {
        return { ...me, visibility: 'full', myRelationship: null, trust: null };
      }
      const myLevel = outMap[m.user_id] || myRels[m.user_id] || 'casual';
      const theirLevel = inMap[m.user_id] || (m.relationships || {})[user.id] || 'casual';
      const trust = (myLevel === 'close' && theirLevel === 'close') ? 'deep'
        : (myLevel === 'close' || theirLevel === 'close') ? 'asymmetric' : 'none';
      // Viewers are read-only observers: never reveal another member's
      // contact_info, private_notes, arrival/departure, or home_city — even
      // when a reciprocal "close" trust would otherwise grant full visibility.
      if (me.role === 'viewer') {
        const { contact_info, arrival_date, departure_date, private_notes, home_city, ...rest } = m;
        return { ...rest, contact_info: null, arrival_date: null, departure_date: null, private_notes: null, home_city: null, visibility: 'limited', myRelationship: myLevel, trust };
      }
      if (me.role === 'owner' || trust === 'deep') {
        return { ...m, visibility: 'full', myRelationship: myLevel, trust };
      }
      const { contact_info, arrival_date, departure_date, private_notes, home_city, ...rest } = m;
      return {
        ...rest,
        contact_info: null,
        arrival_date: null,
        departure_date: null,
        private_notes: null,
        home_city: null,
        visibility: 'limited',
        myRelationship: myLevel,
        trust,
      };
    });

    // Minimal journey items so the gathering header can derive the date range
    // (earliest..latest across the current user's items, falling back to all).
    const journeyItems = (journeyItemsRaw || []).map((it) => ({
      id: it.id,
      type: it.type || null,
      start_datetime: it.start_datetime || null,
      end_datetime: it.end_datetime || null,
      owner_id: it.owner_id || null,
      attendee_user_ids: it.attendee_user_ids || [],
    }));

    let joinRequests = [];
    if (me.role === 'owner') {
      joinRequests = await base44.asServiceRole.entities.JoinRequest.filter({ gathering_id: gatheringId, status: 'pending' }) || [];
    }
    return Response.json({ gathering, currentMember: me, members: masked, joinRequests, journeyItems });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}