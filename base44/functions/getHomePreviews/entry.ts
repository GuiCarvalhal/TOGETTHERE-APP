import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns the current user's gatherings plus a display-safe member preview
// (full_name, photo, role only) per gathering, for avatar stacks on Home.
// Member records are RLS-locked to the user's own row, so we read via the
// service role and return only non-sensitive display fields — consistent
// with what the in-gathering Members directory already exposes.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const myMembers = await base44.entities.Member.filter({ user_id: user.id });
    const gids = (myMembers || []).map((m) => m.gathering_id).filter(Boolean);
    if (!gids.length) return Response.json({ gatherings: [], memberships: [], previews: {} });

    const gatherings = await base44.entities.Gathering.list('-created_date', 100);
    const mine = gatherings.filter((g) => gids.includes(g.id));

    const previews = {};
    await Promise.all(gids.map(async (gid) => {
      const ms = await base44.asServiceRole.entities.Member.filter({ gathering_id: gid });
      previews[gid] = (ms || [])
        .map((m) => ({ full_name: m.full_name, photo: m.photo, role: m.role }))
        .slice(0, 8);
    }));

    return Response.json({
      gatherings: mine,
      memberships: (myMembers || []).map((m) => ({ gathering_id: m.gathering_id, role: m.role })),
      previews,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}