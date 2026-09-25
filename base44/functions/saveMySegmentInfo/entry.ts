import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember } from '../../shared/gatheringAcl.ts';

// Saves the current user's group-visible per-member details for a journey segment
// into JourneyItem.member_info keyed by user id. Empty text removes the entry.
// Verifies the caller is a member of the gathering before writing.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const itemId = body.item_id;
    const text = body.text != null ? String(body.text) : '';
    if (!itemId) return Response.json({ error: 'item_id required' }, { status: 400 });

    const item = await base44.asServiceRole.entities.JourneyItem.get(itemId);
    if (!item) return Response.json({ error: 'Not found' }, { status: 404 });
    const me = await getMyMember(base44, item.gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });

    const info = { ...(item.member_info || {}) };
    if (text.trim()) info[user.id] = text.trim();
    else delete info[user.id];
    await base44.asServiceRole.entities.JourneyItem.update(itemId, { member_info: info });
    return Response.json({ member_info: info });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}