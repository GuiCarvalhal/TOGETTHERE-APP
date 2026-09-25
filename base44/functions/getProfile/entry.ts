import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember } from '../../shared/gatheringAcl.ts';

// Returns a user's profile for the Profile page. For the current user (isSelf),
// returns the full editable profile. For another user, returns a visibility-
// gated view based on the reciprocal close/casual trust model:
//   deep (both close) or viewer-is-owner -> full profile
//   otherwise -> limited (name/avatar/role only)
// Also returns the relationship status both directions and groups in common.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, user_id } = body;
    if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });

    const isSelf = user_id === user.id;

    // Target user's global profile (service role bypasses built-in User perms).
    let targetUser = null;
    try { targetUser = await base44.asServiceRole.entities.User.get(user_id); } catch { /* may not exist */ }

    // Gathering-scoped member records + relationship (requires a gathering).
    let me = null, targetMember = null, myLevel = 'casual', theirLevel = 'casual', trust = 'none';
    if (gathering_id) {
      me = await getMyMember(base44, gathering_id, user.id);
      if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });
      targetMember = await getMyMember(base44, gathering_id, user_id);

      const [outRel, inRel] = await Promise.all([
        base44.entities.Relationship.filter({ owner_user_id: user.id, target_user_id: user_id }).catch(() => []),
        base44.entities.Relationship.filter({ owner_user_id: user_id, target_user_id: user.id }).catch(() => []),
      ]);
      myLevel = (outRel && outRel[0] && outRel[0].level) || (me.relationships || {})[user_id] || 'casual';
      theirLevel = (inRel && inRel[0] && inRel[0].level) || (targetMember?.relationships || {})[user.id] || 'casual';
      trust = (myLevel === 'close' && theirLevel === 'close') ? 'deep'
        : (myLevel === 'close' || theirLevel === 'close') ? 'asymmetric' : 'none';
    }

    const isOwner = me?.role === 'owner';
    const visibility = isSelf || isOwner || trust === 'deep' ? 'full' : 'limited';

    // Groups in common: other gatherings both belong to (only for full view of others).
    let groupsInCommon = [];
    if (!isSelf && visibility === 'full') {
      const [myMembers, targetMembers] = await Promise.all([
        base44.asServiceRole.entities.Member.filter({ user_id: user.id }).catch(() => []),
        base44.asServiceRole.entities.Member.filter({ user_id }).catch(() => []),
      ]);
      const myGids = new Set((myMembers || []).map((m) => m.gathering_id).filter(Boolean));
      const commonGids = (targetMembers || []).map((m) => m.gathering_id).filter((g) => myGids.has(g) && g !== gathering_id);
      const gatherings = await Promise.all(
        [...new Set(commonGids)].map((gid) => base44.asServiceRole.entities.Gathering.get(gid).catch(() => null))
      );
      groupsInCommon = gatherings.filter(Boolean).map((g) => ({
        id: g.id, name: g.name || 'Untitled trip',
        start_date: g.start_date || null, end_date: g.end_date || null,
      }));
    }

    // The target's families (for self, or full view of others) — used by the
    // profile UI and by Expenses split grouping.
    let families = [];
    if (isSelf || visibility === 'full') {
      const allFams = await base44.asServiceRole.entities.Family.list().catch(() => []);
      families = (allFams || [])
        .filter((f) => f.owner_user_id === user_id || (f.member_user_ids || []).includes(user_id))
        .map((f) => ({ id: f.id, name: f.name, member_user_ids: f.member_user_ids || [], owner_user_id: f.owner_user_id }));
    }

    const full = visibility === 'full';
    const safeUser = {
      full_name: targetUser?.full_name || targetMember?.full_name || 'Member',
      email: full ? (targetUser?.email || null) : null,
      photo: targetUser?.photo || targetMember?.photo || null,
      home_city: full ? (targetUser?.home_city || targetMember?.home_city || null) : null,
      home_currency: full ? (targetUser?.home_currency || null) : null,
      bio: full ? (targetUser?.bio || null) : null,
      interests: full ? ((targetUser?.interests?.length ? targetUser.interests : (targetMember?.interests || []))) : [],
      dietary_preferences: full ? ((targetUser?.dietary_preferences?.length ? targetUser.dietary_preferences : (targetMember?.dietary_preferences || []))) : [],
    };
    const safeMember = targetMember ? {
      role: targetMember.role,
      full_name: targetMember.full_name,
      photo: targetMember.photo,
      arrival_date: full ? (targetMember.arrival_date || null) : null,
      departure_date: full ? (targetMember.departure_date || null) : null,
    } : null;

    return Response.json({
      isSelf,
      user: safeUser,
      member: safeMember,
      relationship: isSelf ? null : { myLevel, theirLevel, trust },
      visibility,
      groupsInCommon,
      families,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}