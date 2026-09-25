import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns families relevant to a set of user ids, for Expenses split grouping.
// Service role is used so the caller can group any gathering participant by
// family membership; only families containing at least one requested user are
// returned, and only the grouping fields (id, name, member_user_ids). Family
// membership never merges user records or historical expenses — it is a
// reversible UI grouping with per-member overrides.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { user_ids } = body;
    if (!Array.isArray(user_ids) || !user_ids.length) return Response.json({ families: [] });
    const all = await base44.asServiceRole.entities.Family.list().catch(() => []);
    const idSet = new Set(user_ids);
    const families = (all || [])
      .filter((f) => idSet.has(f.owner_user_id) || (f.member_user_ids || []).some((uid) => idSet.has(uid)))
      .map((f) => ({ id: f.id, name: f.name, member_user_ids: f.member_user_ids || [], owner_user_id: f.owner_user_id }));
    return Response.json({ families });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}