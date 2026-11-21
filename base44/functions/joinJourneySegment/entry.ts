import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { getMyMember } from '../../shared/gatheringAcl.ts';

// Attendance toggle for a journey segment: adds or removes ONE person from the
// segment's attendee_user_ids (the opt-in list, distinct from the ACL
// member_user_ids). The caller may act for themselves, or for a member of their
// own family (Family: owner_user_id + member_user_ids) who is part of this
// gathering — that is what lets a traveler put their household on a flight or a
// dinner in one tap. Anyone else is refused, so a crafted request can never edit
// a stranger's attendance. The segment's creator is always a participant and can
// never be removed here.
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
    const requested = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const targetId = requested || user.id;

    if (targetId !== user.id) {
      const families = await base44.asServiceRole.entities.Family.list().catch(() => []);
      const sameFamily = (families || []).some((f) => {
        const ids = [f.owner_user_id, ...(f.member_user_ids || [])].filter(Boolean);
        return ids.includes(user.id) && ids.includes(targetId);
      });
      if (!sameFamily) {
        return Response.json({ error: 'You can only add or remove members of your own family' }, { status: 403 });
      }
      const targetRows = await base44.asServiceRole.entities.Member
        .filter({ gathering_id: item.gathering_id, user_id: targetId }).catch(() => []);
      const target = (targetRows || [])[0];
      if (!target) return Response.json({ error: 'Not a member of this gathering' }, { status: 400 });
      if (target.role === 'viewer') return Response.json({ error: 'Viewers cannot join journey segments' }, { status: 403 });
    }

    let ids = [...(item.attendee_user_ids || [])];
    if (action === 'join') {
      if (!ids.includes(targetId)) ids.push(targetId);
    } else if (item.owner_id !== targetId) {
      ids = ids.filter((id) => id !== targetId);
    }
    await base44.asServiceRole.entities.JourneyItem.update(itemId, { attendee_user_ids: ids });
    return Response.json({ attendee_user_ids: ids });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}