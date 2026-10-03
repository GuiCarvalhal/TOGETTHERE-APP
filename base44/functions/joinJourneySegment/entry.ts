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
    // Viewers are read-only observers and can never opt in/out of a segment's
    // attendee list — enforced server-side so a crafted request can't bypass it.
    if (me.role === 'viewer') return Response.json({ error: 'Viewers cannot join journey segments' }, { status: 403 });

    // Self-service join OR leave (action defaults to 'join' for backward
    // compatibility). The creator can never leave their own item via this flow
    // — they're always a participant; they manage others via the edit form.
    const action = body.action === 'leave' ? 'leave' : 'join';
    let ids = [...(item.attendee_user_ids || [])];
    if (action === 'join') {
      if (!ids.includes(user.id)) ids.push(user.id);
    } else if (item.owner_id !== user.id) {
      ids = ids.filter((id) => id !== user.id);
    }
    await base44.asServiceRole.entities.JourneyItem.update(itemId, { attendee_user_ids: ids });
    return Response.json({ attendee_user_ids: ids });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}