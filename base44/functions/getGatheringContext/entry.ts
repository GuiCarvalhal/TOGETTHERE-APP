import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { matchMyMember, healMember, syncChildArrays, overlayUserDisplay } from '../../shared/gatheringAcl.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const [gathering, members, journeyItemsRaw] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId }),
    ]);
    let me = matchMyMember(members, user);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });
    // Self-heal beta-imported member records to the real app user id.
    if (me.user_id !== user.id) {
      me = await healMember(base44, me, user);
    }
    // Sync denormalized ACL arrays if the current user's app id isn't reflected yet
    // (handles both just-healed and previously-healed-but-unsynced gatherings).
    if (!(gathering.member_user_ids || []).includes(user.id)) {
      await syncChildArrays(base44, gatheringId);
    }

    // The Casual/Close friendship model has been retired. Visibility is now
    // role-based: participants (owner/admin/member) see full member detail;
    // viewers see limited (contact_info, private_notes, arrival/departure and
    // home_city are masked). No per-pair Relationship queries remain.

    // Enrich my member record with global User profile fields so my card and the
    // Agent reflect the global profile (home_city, interests, display name/photo).
    me = {
      ...me,
      home_city: user.home_city || me.home_city,
      interests: (user.interests && user.interests.length) ? user.interests : me.interests,
      full_name: user.display_name || user.full_name || me.full_name,
      photo: user.photo || me.photo,
    };

    // Overlay the authoritative User display_name/photo onto every member so
    // member displays reflect the global profile without syncing Member records.
    const overlaid = await overlayUserDisplay(base44, members || []);

    const masked = overlaid.map((m) => {
      if (m.id === me.id) {
        return { ...me, visibility: 'full' };
      }
      // Viewers are read-only observers: never reveal another member's
      // contact_info, private_notes, arrival/departure, or home_city.
      if (me.role === 'viewer') {
        const { contact_info, arrival_date, departure_date, private_notes, home_city, ...rest } = m;
        return { ...rest, contact_info: null, arrival_date: null, departure_date: null, private_notes: null, home_city: null, visibility: 'limited' };
      }
      // Participants see full detail for every other member in the gathering.
      return { ...m, visibility: 'full' };
    });

    // Minimal journey items so the gathering header can derive the date range
    // (earliest..latest across the current user's items, falling back to all).
    // Minimal journey items so the gathering header can derive the date range
    // and location. Includes `type` (for Main Event detection + location
    // filtering: lodging/activities only, excluding flights/transport) and the
    // primary place name/coords (for the derived location display).
    const journeyItems = (journeyItemsRaw || []).map((it) => ({
      type: it.type || null,
      start_datetime: it.start_datetime || null,
      end_datetime: it.end_datetime || null,
      owner_id: it.owner_id || null,
      attendee_user_ids: it.attendee_user_ids || [],
      place: it.place ? { name: it.place.name, place_id: it.place.place_id || null, lat: it.place.lat, lng: it.place.lng } : null,
      location_name: it.location_name || null,
    }));

    let joinRequests = [];
    if (me.role === 'owner') {
      joinRequests = await base44.asServiceRole.entities.JoinRequest.filter({ gathering_id: gatheringId, status: 'pending' }) || [];
    }
    return Response.json({ gathering, currentMember: me, members: masked, joinRequests, journeyItems });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}