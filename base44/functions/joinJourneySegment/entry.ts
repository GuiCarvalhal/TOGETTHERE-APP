import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember } from '../../shared/gatheringAcl.ts';

// Self-service "I'm on this too": adds the current user to the segment's
// attendee_user_ids (the opt-in attendees list, distinct from the ACL
// member_user_ids). Verifies the caller is a member of the gathering.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const itemId = body.item_id;
    if (!itemId) return Response.json({ error: 'item_id required' }, { status: 400 });

    const item = await base44.asServiceRole.entities.JourneyItem.get(itemId);
    if (!item) return Response.json({ error: 'Not found' }, { status: 404 });
    const me = await getMyMember(base44, item.gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });

    const ids = item.attendee_user_ids || [];
    if (!ids.includes(user.id)) {
      ids.push(user.id);
      await base44.asServiceRole.entities.JourneyItem.update(itemId, { attendee_user_ids: ids });
    }
    return Response.json({ attendee_user_ids: ids });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}