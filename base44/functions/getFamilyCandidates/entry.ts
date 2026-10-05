import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns all people the current user has traveled with — every participant
// (owner/admin/member, never viewers) from every gathering the user is a
// member of — plus each person's family membership (if any), so the
// FamilyManager can show candidates and block those already in another family.
//
// Deduplicates by user_id across gatherings. Excludes the current user. The
// one-family-per-user invariant is enforced atomically by manageFamily; this
// function only provides the candidate list + their current family status for
// the UI to show blocked candidates inline.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // All gatherings the user is a member of
    const myMembers = await base44.asServiceRole.entities.Member.filter({ user_id: user.id }).catch(() => []);
    const gids = [...new Set((myMembers || []).map((m) => m.gathering_id).filter(Boolean))];
    if (!gids.length) return Response.json({ candidates: [] });

    // All members from those gatherings (parallel)
    const membersByGid = await Promise.all(
      gids.map((gid) =>
        base44.asServiceRole.entities.Member.filter({ gathering_id: gid }).catch(() => [])
      )
    );

    // Deduplicate by user_id, exclude self and viewers (participants only)
    const seen = new Set([user.id]);
    const candidates = [];
    for (const members of membersByGid) {
      for (const m of members || []) {
        if (!m.user_id || seen.has(m.user_id)) continue;
        if (m.role === 'viewer') continue;
        seen.add(m.user_id);
        candidates.push({ user_id: m.user_id, full_name: m.full_name, photo: m.photo });
      }
    }

    // Family membership for each candidate
    const allFams = await base44.asServiceRole.entities.Family.list().catch(() => []);
    const familyOfUid = {};
    for (const f of allFams || []) {
      for (const uid of [f.owner_user_id, ...(f.member_user_ids || [])]) {
        if (!familyOfUid[uid]) familyOfUid[uid] = { id: f.id, name: f.name };
      }
    }

    return Response.json({
      candidates: candidates.map((c) => ({
        ...c,
        family: familyOfUid[c.user_id] || null,
      })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}