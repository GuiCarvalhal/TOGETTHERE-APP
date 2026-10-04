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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, fields } = body;
    if (!gathering_id || !fields) return Response.json({ error: 'gathering_id and fields required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member' }, { status: 403 });

    const update = {};
    for (const key of ALLOWED) {
      if (key in fields) update[key] = fields[key];
    }
    if (Object.keys(update).length === 0) return Response.json({ error: 'No updatable fields' }, { status: 400 });

    await base44.asServiceRole.entities.Member.update(me.id, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}