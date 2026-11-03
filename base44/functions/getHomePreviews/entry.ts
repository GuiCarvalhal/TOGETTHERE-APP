import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { waitUntil } from 'base44:runtime';
import { resolveMyMembers, overlayUserDisplay } from '../../shared/gatheringAcl.ts';
import { normalizeEmail } from '../../shared/reservationImport.ts';
import { listUserConnections, maybeSyncInboxInBackground, sanitizeConnection } from '../../shared/inboxConnectors.ts';

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

    // Throttled, fire-and-forget mailbox sync. It runs after the response is
    // sent, at most once per throttle window, and never surfaces an error here.
    waitUntil(maybeSyncInboxInBackground(base44, user).catch(() => {}));

    const { members: myMembers } = await resolveMyMembers(base44, user);
    const gids = (myMembers || []).map((m) => m.gathering_id).filter(Boolean);

    const gatherings = await base44.entities.Gathering.list('-created_date', 100);
    const mine = gatherings.filter((g) => gids.includes(g.id));

    const previews = {};
    const itemsByGathering = {};
    const userKeys = new Set([user.id, normalizeEmail(user.email || '')].filter(Boolean));
    // The user's "current" journey item to surface on Home ??? an ONGOING activity
    // (started, not yet ended) takes priority; otherwise the next UPCOMING one
    // (start in the future). Participant = item creator (owner_id) or explicit
    // attendee (attendee_user_ids), matching the Journey page's MINE scope.
    // Ongoing = start <= now AND (no end OR end >= now); among ongoing, the one
    // that started most recently wins. Upcoming = start >= now (strictly future
    // or starting now); the earliest-start such item wins. Participants are the
    // item's actual attendees (or the creator fallback) resolved to minimal
    // member previews so the card avatars match the Journey.
    const now = Date.now();
    let ongoing = null;
    let nextUpcoming = null;
    await Promise.all(gids.map(async (gid) => {
      const [ms, its] = await Promise.all([
        base44.asServiceRole.entities.Member.filter({ gathering_id: gid }),
        base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }),
      ]);
      const overlaidMs = await overlayUserDisplay(base44, ms || []);
      previews[gid] = overlaidMs
        .map((m) => ({ full_name: m.full_name, photo: m.photo, role: m.role }))
        .slice(0, 8);
      itemsByGathering[gid] = (its || []).map((it) => ({
        type: it.type || null,
        start_datetime: it.start_datetime || null,
        end_datetime: it.end_datetime || null,
        owner_id: it.owner_id || null,
        attendee_user_ids: it.attendee_user_ids || [],
        place: it.place ? { name: it.place.name, place_id: it.place.place_id || null, lat: it.place.lat, lng: it.place.lng } : null,
        location_name: it.location_name || null,
      }));
      const memberByUid = {};
      overlaidMs.forEach((m) => { if (m.user_id) memberByUid[m.user_id] = m; });
      const resolveParticipants = (it) => {
        // Flights never fall back to the creator for avatar display ??? an empty
        // attendee list means "no one joined yet", not the owner. Other types
        // keep the existing creator fallback.
        const pids = (it.attendee_user_ids || []).length
          ? it.attendee_user_ids
          : (it.type === 'flight' ? [] : (it.owner_id ? [it.owner_id] : []));
        return pids
          .map((uid) => memberByUid[uid])
          .filter(Boolean)
          .map((m) => ({ id: m.id, photo: m.photo, full_name: m.full_name }));
      };
      for (const it of (its || [])) {
        const isParticipant = it.owner_id === user.id || (it.attendee_user_ids || []).includes(user.id);
        if (!isParticipant || !it.start_datetime) continue;
        const startMs = new Date(it.start_datetime).getTime();
        const endMs = it.end_datetime ? new Date(it.end_datetime).getTime() : null;
        const isOngoing = startMs <= now && (endMs === null || endMs >= now);
        if (isOngoing) {
          if (!ongoing || startMs > ongoing.startMs) {
            ongoing = { item: it, gatheringId: gid, participants: resolveParticipants(it), startMs };
          }
        } else if (startMs >= now) {
          if (!nextUpcoming || startMs < nextUpcoming.startMs) {
            nextUpcoming = { item: it, gatheringId: gid, participants: resolveParticipants(it), startMs };
          }
        }
      }
    }));

    // Journey inbox summary: how many imported segments are still waiting plus a
    // short preview of the soonest. Loaded BEFORE the pending imports so a row
    // already represented in the inbox can be left out of that list.
    const inboxRaw = await base44.asServiceRole.entities.JourneyInboxItem
      .filter({ owner_user_id: user.id, status: 'new' })
      .catch(() => []);
    const inboxRows = (Array.isArray(inboxRaw) ? inboxRaw : (inboxRaw?.items || []))
      .slice()
      .sort((a: any, b: any) => String(a.start_datetime || '').localeCompare(String(b.start_datetime || '')));
    const inboxPreview = inboxRows.slice(0, 3).map((row: any) => ({
      id: row.id,
      type: row.type || 'other',
      title: row.title || '',
      start_datetime: row.start_datetime || null,
      source_sender: row.source_sender || '',
      missing: row.missing || [],
    }));
    const inboxImportIds = new Set(inboxRows.map((row: any) => row.import_id).filter(Boolean));

    const pendingRaw = await base44.asServiceRole.entities.ReservationImport.list('-created_date', 100).catch(() => []);
    const pendingImports = (pendingRaw || [])
      .filter((row) => {
        if (row.status !== 'pending') return false;
        // Already waiting in the Journey Inbox: the inbox panel presents it, so
        // it must not also appear as a second "needs a decision" card.
        if (inboxImportIds.has(row.id)) return false;
        const keys = Array.isArray(row.target_user_keys) ? row.target_user_keys : [];
        return keys.some((k) => userKeys.has(normalizeEmail(k || '') || k));
      })
      .slice(0, 10)
      .map((row) => ({
        id: row.id,
        source_subject: row.source_subject || '',
        source_sender: row.source_sender || '',
        source_received_at: row.source_received_at || '',
        content_excerpt: row.content_excerpt || '',
        suggested_gathering_id: row.suggested_gathering_id || '',
        candidate_gathering_ids: row.candidate_gathering_ids || [],
        extracted_draft: row.extracted_draft || {},
        classification_type: row.classification_type || '',
        classification_confidence: row.classification_confidence || 0,
        classification_signals: row.classification_signals || [],
      }));

    // Home shows a single "Sync now" entry point, so it needs to know whether the
    // user has any mailbox at all (and its state) without a second round trip.
    const inboxConnections = (await listUserConnections(base44, user).catch(() => []))
      .map(sanitizeConnection);

    const chosen = ongoing || nextUpcoming;
    return Response.json({
      gatherings: mine,
      inboxConnections,
      memberships: (myMembers || []).map((m) => ({ gathering_id: m.gathering_id, role: m.role })),
      previews,
      itemsByGathering,
      pendingImports,
      inboxItems: inboxPreview,
      inboxCount: inboxRows.length,
      userId: user.id,
      nextUpcoming: chosen
        ? { item: chosen.item, gatheringId: chosen.gatheringId, participants: chosen.participants, ongoing: chosen === ongoing }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}