import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';

const ALLOWED = [
  'dietary_preferences', 'interests', 'contact_info', 'private_notes',
  'arrival_date', 'departure_date', 'home_city', 'photo', 'full_name', 'budget_level',
];
// NOTE: the legacy `relationships` field is intentionally NOT in ALLOWED. The
// Casual/Close friendship model has been retired — the field stays stored on
// existing Member records for fidelity but is no longer writable through this
// function, and no new `relationship_close` activities are logged from here.

// Universal profile edit. The global profile name (display_name) and photo are
// persisted on the User entity via updateMe in the client — this function
// ONLY syncs name + photo to the Member record when a gathering_id is provided,
// so gathering cards/avatars update there too. When no gathering_id is given
// (the universal profile page without ?g=), there's nothing to do here: the
// global update already happened via updateMe. Roles and memberships are
// never changed by this function.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, fields } = body;
    if (!fields) return Response.json({ error: 'fields required' }, { status: 400 });

    // No gathering context — the global update (display_name, photo, etc.)
    // already happened via updateMe in the client. Mirror the identity fields
    // onto EVERY member row of this user, so the per-gathering copies that some
    // surfaces read directly (avatar stacks, the family picker, past members)
    // always show the same face and name as the global profile.
    if (!gathering_id) {
      const identity = {};
      if (typeof fields.photo === 'string') identity.photo = fields.photo;
      if (typeof fields.full_name === 'string' && fields.full_name.trim()) identity.full_name = fields.full_name.trim();
      if (!Object.keys(identity).length) return Response.json({ ok: true });
      const rows = await base44.asServiceRole.entities.Member.filter({ user_id: user.id }).catch(() => []);
      if (rows.length) {
        await base44.asServiceRole.entities.Member
          .bulkUpdate(rows.map((r) => ({ id: r.id, ...identity })))
          .catch(() => {});
      }
      return Response.json({ ok: true, synced: rows.length });
    }

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member' }, { status: 403 });

    const update = {};
    for (const key of ALLOWED) {
      if (key in fields) update[key] = fields[key];
    }
    if (Object.keys(update).length === 0) return Response.json({ ok: true });

    await base44.asServiceRole.entities.Member.update(me.id, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}