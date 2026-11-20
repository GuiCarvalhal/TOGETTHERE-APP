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
//
// Performance shape (Home is the first screen after sign-in):
//   • every independent query starts at once — the response waits for the
//     slowest call, not for the sum of them;
//   • Members and JourneyItems are fetched ONCE for all gatherings instead of
//     once per gathering, and the User display overlay is a single batched read;
//   • gatherings are read by id instead of pulling a global recent list.
// ── Which segment Home features ──────────────────────────────────────────────
// A segment whose duration IS the event (a flight, a dinner, an activity) holds
// the card for as long as it runs. A CONTAINER segment (a stay, a cruise, a
// rental) can run for days, and other segments happen inside that window — so
// once something else is about to start inside it, the card hands over instead
// of showing the same hotel until check-out.
const CONTAINER_TYPES = new Set(['hotel', 'cruise', 'car']);
// A container only steps aside for something starting within this window, so a
// 10-day cruise is not displaced by an excursion five days away.
// Nothing hands over the instant it ends either: END_GRACE_MS keeps the finished
// segment on the card for a while, so a late landing never jumps Home straight
// to a segment that is days away.
const CONTAINER_LOOKAHEAD_MS = 24 * 60 * 60 * 1000;
// How long the featured segment keeps the card AFTER its scheduled end. Without
// this the card flips the minute the end time passes: a flight that lands 20
// minutes late (or is still taxiing/deplaning) hands Home over to a segment that
// is days away. Flights get the longer window because they routinely run behind
// schedule; everything else keeps a shorter hold.
const END_GRACE_MS = { flight: 2 * 60 * 60 * 1000, default: 60 * 60 * 1000 };

function pickFeatured(ongoing, nextUpcoming, nowMs) {
  if (!ongoing) return nextUpcoming;
  if (!nextUpcoming) return ongoing;
  if (!CONTAINER_TYPES.has(ongoing.item.type)) return ongoing;
  const startsSoon = nextUpcoming.startMs - nowMs <= CONTAINER_LOOKAHEAD_MS;
  const insideWindow = ongoing.endMs !== null && nextUpcoming.startMs <= ongoing.endMs;
  // The container keeps the card only while it is the more recent thing: a stay
  // checked into minutes ago outranks a dinner hours out, but something that
  // starts sooner than the stay started recently takes the card over.
  const moreRecentThanNext = nowMs - ongoing.startMs < nextUpcoming.startMs - nowMs;
  return startsSoon && insideWindow && !moreRecentThanNext ? nextUpcoming : ongoing;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Throttled, fire-and-forget mailbox sync. It runs after the response is
    // sent, at most once per throttle window, and never surfaces an error here.
    waitUntil(maybeSyncInboxInBackground(base44, user).catch(() => {}));

    const svc = base44.asServiceRole.entities;
    const myEmail = normalizeEmail(user.email || '');
    const userKeys = new Set([user.id, myEmail].filter(Boolean));

    const [myMembersRes, inboxRaw, pendingTxRaw, pendingRaw, connectionsRaw] = await Promise.all([
      resolveMyMembers(base44, user).catch(() => ({ members: [] })),
      svc.JourneyInboxItem.filter({ owner_user_id: user.id, status: 'new' }).catch(() => []),
      svc.FinancialTransaction.filter({ owner_user_id: user.id, review_status: { $in: ['new', 'suggested'] } }).catch(() => []),
      svc.ReservationImport.list('-created_date', 100).catch(() => []),
      listUserConnections(base44, user).catch(() => []),
    ]);

    const myMembers = myMembersRes?.members || [];
    const gids = [...new Set(myMembers.map((m) => m.gathering_id).filter(Boolean))];

    const [gatheringRows, memberRows, itemRows] = await Promise.all([
      gids.length ? svc.Gathering.filter({ id: { $in: gids } }).catch(() => []) : [],
      gids.length ? svc.Member.filter({ gathering_id: { $in: gids } }).catch(() => []) : [],
      gids.length ? svc.JourneyItem.filter({ gathering_id: { $in: gids } }).catch(() => []) : [],
    ]);
    const allGatherings = Array.isArray(gatheringRows) ? gatheringRows : (gatheringRows?.items || []);
    const memberList = await overlayUserDisplay(base44, (Array.isArray(memberRows) ? memberRows : (memberRows?.items || [])));
    const itemList = Array.isArray(itemRows) ? itemRows : (itemRows?.items || []);

    const membersByGathering = {};
    for (const m of memberList) {
      const key = m.gathering_id;
      if (!key) continue;
      (membersByGathering[key] = membersByGathering[key] || []).push(m);
    }
    const itemsByGatheringRaw = {};
    for (const it of itemList) {
      const key = it.gathering_id;
      if (!key) continue;
      (itemsByGatheringRaw[key] = itemsByGatheringRaw[key] || []).push(it);
    }

    // Soft-deleted gatherings are hidden from every normal gathering list. The
    // owner alone sees them in Home's "Recently deleted" panel, where restoring
    // one clears the flags (nothing was removed when it was deleted).
    const mine = allGatherings.filter((g) => gids.includes(g.id) && g.is_deleted !== true);
    const activeGids = mine.map((g) => g.id);
    const deletedGatherings = allGatherings
      .filter((g) => g.is_deleted === true && gids.includes(g.id))
      .filter((g) => (g.created_by_id === user.id)
        || (!!g.owner_user_id && (g.owner_user_id === user.id || normalizeEmail(g.owner_user_id) === myEmail)))
      .map((g) => ({
        id: g.id,
        name: g.name || '',
        destinations: g.destinations || [],
        start_date: g.start_date || null,
        deleted_at: g.deleted_at || null,
      }));

    const previews = {};
    const itemsByGathering = {};
    // The user's "current" journey item to surface on Home: an ONGOING activity
    // (started, not yet ended) or, when a long stay is not the thing happening
    // next, the UPCOMING one (start in the future) — see pickFeatured below.
    // Participant = item creator (owner_id) or explicit attendee
    // (attendee_user_ids), matching the Journey page's MINE scope.
    // Among ongoing, the one that started most recently wins; among upcoming, the
    // earliest start wins. Participants are the item's actual attendees (or the
    // creator fallback) resolved to minimal member previews so the card avatars
    // match the Journey. The timezone boundary below is what keeps the past out.
    // Only TODAY OR AHEAD may be featured, judged in the USER's timezone: the
    // client sends its offset (minutes, as getTimezoneOffset returns it), so an
    // item that already happened earlier today is never offered as the next one.
    const nowMs = Date.now();
    const tzOffsetMinutes = Number(body?.tz_offset_minutes);
    const offsetMs = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes * 60000 : 0;
    const startOfTodayMs = Math.floor((nowMs - offsetMs) / 86400000) * 86400000 + offsetMs;
    let ongoing = null;
    let nextUpcoming = null;

    for (const gid of activeGids) {
      const overlaidMs = membersByGathering[gid] || [];
      const its = itemsByGatheringRaw[gid] || [];
      previews[gid] = overlaidMs
        .map((m) => ({ full_name: m.full_name, photo: m.photo, role: m.role }))
        .slice(0, 8);
      itemsByGathering[gid] = its.filter((it) => it.is_deleted !== true).map((it) => ({
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
      for (const it of its) {
        const isParticipant = it.owner_id === user.id || (it.attendee_user_ids || []).includes(user.id);
        if (!isParticipant || !it.start_datetime) continue;
        const startMs = new Date(it.start_datetime).getTime();
        const endMs = it.end_datetime ? new Date(it.end_datetime).getTime() : null;
        // An item with NO end date stops being "ongoing" at the end of its start
        // day, so a past activity can never be featured indefinitely. An item
        // WITH an end holds the card for END_GRACE_MS past it, so a late landing
        // never flips Home to a segment days ahead.
        const graceMs = it.type === 'flight' ? END_GRACE_MS.flight : END_GRACE_MS.default;
        const isOngoing = startMs <= nowMs && (endMs !== null ? endMs + graceMs >= nowMs : startMs >= startOfTodayMs);
        // Nothing from the past: either happening now, or starting today onwards.
        if (!isOngoing && startMs < startOfTodayMs) continue;
        if (isOngoing) {
          if (!ongoing || startMs > ongoing.startMs) {
            // endMs is the window a container segment hands over inside of; an
            // item without an end keeps the rest of its start day, matching
            // the isOngoing rule above.
            ongoing = { item: it, gatheringId: gid, participants: resolveParticipants(it), startMs, endMs: endMs !== null ? endMs : startOfTodayMs + 86400000 };
          }
        } else if (startMs >= nowMs) {
          if (!nextUpcoming || startMs < nextUpcoming.startMs) {
            nextUpcoming = { item: it, gatheringId: gid, participants: resolveParticipants(it), startMs };
          }
        }
      }
    }

    // Journey inbox summary: how many imported segments are still waiting plus a
    // short preview of the soonest. Read above (in parallel with everything else)
    // so a row already represented in the inbox can be left out of the pending
    // imports list below.
    const inboxRows = (Array.isArray(inboxRaw) ? inboxRaw : (inboxRaw?.items || []))
      .slice()
      .sort((a: any, b: any) => String(a.start_datetime || '').localeCompare(String(b.start_datetime || '')));
    const inboxImportIds = new Set(inboxRows.map((row: any) => row.import_id).filter(Boolean));

    // Card/bank transactions awaiting review live in the same Inbox, so the
    // badge Home publishes covers both streams.
    const pendingTxCount = (Array.isArray(pendingTxRaw) ? pendingTxRaw : (pendingTxRaw?.items || [])).length;

    const pendingImports = (Array.isArray(pendingRaw) ? pendingRaw : (pendingRaw?.items || []))
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
    const inboxConnections = (connectionsRaw || []).map(sanitizeConnection);

    const chosen = pickFeatured(ongoing, nextUpcoming, nowMs);
    return Response.json({
      gatherings: mine,
      deletedGatherings,
      inboxConnections,
      memberships: myMembers.map((m) => ({ gathering_id: m.gathering_id, role: m.role })),
      previews,
      itemsByGathering,
      pendingImports,
      inboxCount: inboxRows.length + pendingTxCount,
      userId: user.id,
      nextUpcoming: chosen
        ? { item: chosen.item, gatheringId: chosen.gatheringId, participants: chosen.participants, ongoing: chosen === ongoing }
        : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}