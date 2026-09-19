import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';

const WHITELIST = ['name', 'cover_image', 'start_date', 'end_date', 'destinations', 'description', 'privacy_mode', 'status'];
const PRIVACY_MODES = ['open', 'invite', 'approval'];
const STATUSES = ['planning', 'active', 'completed'];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, fields } = body;
    if (!gathering_id || !fields || typeof fields !== 'object') {
      return Response.json({ error: 'gathering_id and fields required' }, { status: 400 });
    }
    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role !== 'owner') {
      return Response.json({ error: 'Only the gathering owner can edit settings' }, { status: 403 });
    }
    const allowed = {};
    for (const k of WHITELIST) {
      if (k in fields) allowed[k] = fields[k];
    }
    if (allowed.privacy_mode && !PRIVACY_MODES.includes(allowed.privacy_mode)) {
      return Response.json({ error: 'Invalid privacy mode' }, { status: 400 });
    }
    if (allowed.status && !STATUSES.includes(allowed.status)) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (allowed.destinations && !Array.isArray(allowed.destinations)) {
      return Response.json({ error: 'destinations must be an array' }, { status: 400 });
    }
    const updated = await base44.asServiceRole.entities.Gathering.update(gathering_id, allowed);
    return Response.json({ gathering: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}