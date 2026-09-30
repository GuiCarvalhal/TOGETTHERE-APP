import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { resolveMyMembers } from '../../shared/gatheringAcl.ts';

// Returns the current user's gatherings plus a display-safe member preview
// (full_name, photo, role only) per gathering, for avatar stacks on Home, AND
// the minimal journey items per gathering so the client can derive each
// gathering's date range (earliest..latest across the user's items, falling
// back to all items, then legacy start_date/end_date). Member + JourneyItem
// reads use the service role and return only non-sensitive / minimal fields.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { members: myMembers } = await resolveMyMembers(base44, user);
    const gids = (myMembers || []).map((m) => m.gathering_id).filter(Boolean);
    if (!gids.length) return Response.json({ gatherings: [], memberships: [], previews: {}, itemsByGathering: {}, userId: user.id });

    const gatherings = await base44.entities.Gathering.list('-created_date', 100);
    const mine = gatherings.filter((g) => gids.includes(g.id));

    const previews = {};
    const itemsByGathering = {};
    // Next upcoming journey item the signed-in user is a participant of, across
    // all their gatherings — surfaced on Home as the "Up next" card. Participant
    // = item creator (owner_id) or explicit attendee (attendee_user_ids),
    // matching the Journey page's MINE scope. "Upcoming" = start_datetime >= now
    // (strictly future or starting now); the earliest-start such item wins.
    // Participants are the item's actual attendees (or the creator fallback)
    // resolved to minimal member previews so the card avatars match the Journey.
    const now = Date.now();
    let nextUpcoming = null;
    await Promise.all(gids.map(async (gid) => {
      const [ms, its] = await Promise.all([
        base44.asServiceRole.entities.Member.filter({ gathering_id: gid }),
        base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }),
      ]);
      previews[gid] = (ms || [])
        .map((m) => ({ full_name: m.full_name, photo: m.photo, role: m.role }))
        .slice(0, 8);
      itemsByGathering[gid] = (its || []).map((it) => ({
        start_datetime: it.start_datetime || null,
        end_datetime: it.end_datetime || null,
        owner_id: it.owner_id || null,
        attendee_user_ids: it.attendee_user_ids || [],
      }));
      const memberByUid = {};
      (ms || []).forEach((m) => { if (m.user_id) memberByUid[m.user_id] = m; });
      for (const it of (its || [])) {
        const isParticipant = it.owner_id === user.id || (it.attendee_user_ids || []).includes(user.id);
        if (!isParticipant || !it.start_datetime) continue;
        const startMs = new Date(it.start_datetime).getTime();
        if (startMs < now) continue;
        if (!nextUpcoming || startMs < nextUpcoming.startMs) {
          const pids = (it.attendee_user_ids || []).length ? it.attendee_user_ids : (it.owner_id ? [it.owner_id] : []);
          const participants = pids
            .map((uid) => memberByUid[uid])
            .filter(Boolean)
            .map((m) => ({ id: m.id, photo: m.photo, full_name: m.full_name }));
          nextUpcoming = { item: it, gatheringId: gid, participants, startMs };
        }
      }
    }));

    return Response.json({
      gatherings: mine,
      memberships: (myMembers || []).map((m) => ({ gathering_id: m.gathering_id, role: m.role })),
      previews,
      itemsByGathering,
      userId: user.id,
      nextUpcoming: nextUpcoming
        ? { item: nextUpcoming.item, gatheringId: nextUpcoming.gatheringId, participants: nextUpcoming.participants }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}