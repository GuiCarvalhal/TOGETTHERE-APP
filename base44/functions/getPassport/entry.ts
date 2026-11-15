import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { TZ_COUNTRY } from '../../shared/googlePlaces.ts';

// The user's passport: every country their own gatherings took them to, plus the
// countries they added by hand (visited) or put on their bucket list.
//
// Stamps are DERIVED, never copied: a country is stamped because a live journey
// item the user PERSONALLY travels on resolves to that country, so editing a trip
// updates the passport with no sync job and nothing to back-fill. Only the manual
// additions live in PassportCountry rows.
//
// "Personally travels on" means both:
//   1. the gathering counts — the user is its owner/creator or a participant
//      member there. A VIEWER never earns a stamp.
//   2. the item counts — the user is on that segment: in attendee_user_ids, or
//      (for non-flight segments with nobody opted in) its creator. A segment the
//      rest of the group took without them stamps nothing.
const ISO2 = /^[A-Z]{2}$/;
const ROLE_RANK = { owner: 4, admin: 3, member: 2, viewer: 1 };

// A place stores the ISO short_name from Google address components; when a
// legacy row has no country, the IANA timezone is a safe fallback.
function countryOf(place: any): string {
  if (!place || typeof place !== 'object') return '';
  const code = String(place.country || '').trim().toUpperCase();
  if (ISO2.test(code)) return code;
  const tz = String(place.tz || '').trim();
  return tz ? (TZ_COUNTRY[tz] || '') : '';
}

function dayOf(value: any): string {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole.entities;
    const email = String(user.email || '').trim().toLowerCase();
    const keys = [user.id, email].filter(Boolean);

    // ── The gatherings this user travelled on ───────────────────────────
    // Memberships cover the gatherings they joined; the owner of a gathering is
    // a traveller even when no Member row was ever written for them. One query
    // per condition (no $or): a single unparsable $or would widen this to every
    // gathering in the app and stamp trips the user never took.
    const [byId, byEmail, byContact, ownerOf, created, aclMember, aclParticipant] = await Promise.all([
      svc.Member.filter({ user_id: user.id }).catch(() => []),
      email ? svc.Member.filter({ email }).catch(() => []) : [],
      email ? svc.Member.filter({ contact_info: email }).catch(() => []) : [],
      svc.Gathering.filter({ owner_user_id: user.id }).catch(() => []),
      svc.Gathering.filter({ created_by_id: user.id }).catch(() => []),
      svc.Gathering.filter({ member_user_ids: { $in: [user.id] } }).catch(() => []),
      svc.Gathering.filter({ participant_user_ids: { $in: [user.id] } }).catch(() => []),
    ]);
    const myMembers = [...(byId || []), ...(byEmail || []), ...(byContact || [])];
    const gatheringIds = [...new Set([
      ...myMembers.map((m: any) => m.gathering_id).filter(Boolean),
      ...[...(ownerOf || []), ...(created || []), ...(aclMember || []), ...(aclParticipant || [])]
        .map((g: any) => g.id).filter(Boolean),
    ])].slice(0, 200);

    // Strongest role the user holds per gathering (a legacy duplicate row must
    // never downgrade a real member to viewer, or the other way round).
    const roleRank = new Map<string, number>();
    for (const m of myMembers) {
      const gid = m?.gathering_id;
      if (!gid) continue;
      const rank = m?.role ? (ROLE_RANK[m.role] || 0) : 2; // legacy row with no role = member
      if (rank > (roleRank.get(gid) || 0)) roleRank.set(gid, rank);
    }

    const [gatherings, items, saved] = await Promise.all([
      gatheringIds.length ? svc.Gathering.filter({ id: { $in: gatheringIds } }).catch(() => []) : [],
      gatheringIds.length ? svc.JourneyItem.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []) : [],
      svc.PassportCountry.filter({ target_user_keys: { $in: keys } }).catch(() => []),
    ]);

    // Gatherings the user genuinely travels on: owner/creator, or a participant
    // member. A viewer (rank 1) only counts when they own the gathering.
    const travelsOn = (g: any) => {
      if (g.owner_user_id === user.id || g.created_by_id === user.id) return true;
      const rank = roleRank.get(g.id) || 0;
      if (rank) return rank >= 2; // member/admin/owner yes, viewer no
      return Array.isArray(g.participant_user_ids) && g.participant_user_ids.includes(user.id);
    };

    const tripById = new Map(
      (gatherings || [])
        .filter((g: any) => !g.is_deleted && travelsOn(g))
        .map((g: any) => [g.id, { id: g.id, name: g.name || '', date: dayOf(g.start_date) }]),
    );

    // Segments the user is personally on. When the segment has an attendee list,
    // that list decides: someone else's side trip stamps nothing for them. When
    // it has none (segments migrated in from the previous app), the segment is
    // the group's — but only if it carries no real app user as its owner, so a
    // member's own segment still never stamps anyone else.
    const isRealUserId = (v: any) => /^[0-9a-f]{24}$/i.test(String(v || ''));
    const isOnItem = (item: any) => {
      const attendees = Array.isArray(item.attendee_user_ids) ? item.attendee_user_ids : [];
      if (attendees.length) return attendees.includes(user.id);
      const owner = String(item.owner_id || '');
      if (!owner) return true;
      return owner === user.id || !isRealUserId(owner);
    };

    // ── Who was there, per gathering ────────────────────────────────────
    // ONE batched directory read for every qualifying trip (never one query per
    // item), so a country can accumulate its companions with no N+1 pattern.
    // Viewers are not companions: they only watch the trip.
    const tripIds = [...tripById.keys()];
    const tripMembers = tripIds.length
      ? await svc.Member.filter({ gathering_id: { $in: tripIds } }).catch(() => [])
      : [];
    const viewerIdsByTrip = new Map<string, Set<string>>();
    const companionIdsByTrip = new Map<string, Set<string>>();
    const personById = new Map<string, any>();
    const bucketOf = (gid: string) => {
      if (!companionIdsByTrip.has(gid)) {
        companionIdsByTrip.set(gid, new Set());
        viewerIdsByTrip.set(gid, new Set());
      }
      return companionIdsByTrip.get(gid)!;
    };
    for (const m of tripMembers || []) {
      const gid = String(m?.gathering_id || '');
      const uid = String(m?.user_id || '');
      if (!tripById.has(gid) || !uid) continue;
      if (m.role === 'viewer') { bucketOf(gid); viewerIdsByTrip.get(gid)!.add(uid); continue; }
      bucketOf(gid).add(uid);
      if (uid !== user.id && (m.full_name || m.photo) && !personById.has(uid)) {
        personById.set(uid, { id: uid, full_name: m.full_name || '', photo: m.photo || '' });
      }
    }
    for (const g of gatherings || []) {
      if (!tripById.has(g.id)) continue;
      const set = bucketOf(g.id);
      const viewers = viewerIdsByTrip.get(g.id)!;
      for (const raw of [...(g.participant_user_ids || []), ...(g.member_user_ids || [])]) {
        const uid = String(raw || '');
        if (isRealUserId(uid) && uid !== user.id && !viewers.has(uid)) set.add(uid);
      }
    }
    for (const set of companionIdsByTrip.values()) set.delete(user.id);

    // Names/photos for companions with no member row in that gathering: one more
    // batched read instead of a lookup per person.
    const needInfo = [...new Set([...companionIdsByTrip.values()].flatMap((s) => [...s]))]
      .filter((uid) => isRealUserId(uid) && !personById.has(uid));
    if (needInfo.length) {
      const people = await svc.User.filter({ id: { $in: needInfo.slice(0, 200) } }).catch(() => []);
      for (const u of people || []) {
        if (!personById.has(u.id)) personById.set(u.id, { id: u.id, full_name: u.full_name || '', photo: u.photo || '' });
      }
    }

    // ── Stamps earned on real trips ─────────────────────────────────────
    const stamped = new Map();
    for (const item of items || []) {
      if (item.is_deleted) continue;
      const trip: any = tripById.get(item.gathering_id);
      if (!trip) continue;
      if (!isOnItem(item)) continue;
      // Companions on THIS segment: when it carries an attendee list that list
      // decides (someone who stayed home is not a companion on that trip),
      // otherwise the gathering's participating crew. Viewers never qualify.
      const attendees = Array.isArray(item.attendee_user_ids)
        ? item.attendee_user_ids.filter((id: any) => isRealUserId(id))
        : [];
      const viewers = viewerIdsByTrip.get(item.gathering_id) || new Set<string>();
      const segmentCompanions = attendees.length
        ? attendees.filter((id: any) => !viewers.has(String(id)))
        : [...(companionIdsByTrip.get(item.gathering_id) || [])];

      const day = dayOf(item.start_datetime) || dayOf(item.end_datetime);
      const codes = new Set(
        [countryOf(item.place), countryOf(item.from_place), countryOf(item.to_place)].filter(Boolean),
      );
      for (const code of codes) {
        const entry: any = stamped.get(code) || { code, firstVisit: '', trips: new Map(), companions: new Set(), manual: false };
        if (day && (!entry.firstVisit || day < entry.firstVisit)) entry.firstVisit = day;
        entry.trips.set(trip.id, trip);
        // Union across every segment and gathering that stamped this country,
        // deduplicated by user id.
        for (const uid of segmentCompanions) {
          const key = String(uid);
          if (key && key !== user.id) entry.companions.add(key);
        }
        stamped.set(code, entry);
      }
    }

    // ── Additions the user made by hand ─────────────────────────────────
    const bucket = new Map();
    for (const row of saved || []) {
      const code = String(row.country_code || '').trim().toUpperCase();
      if (!ISO2.test(code)) continue;
      if (row.status === 'visited') {
        const entry: any = stamped.get(code) || { code, firstVisit: '', trips: new Map(), companions: new Set(), manual: false };
        entry.manual = true;
        stamped.set(code, entry);
      } else if (row.status === 'bucket' && !stamped.has(code)) {
        bucket.set(code, { code });
      }
    }

    const visited = [...stamped.values()]
      .map((e: any) => ({
        code: e.code,
        source: e.manual ? (e.trips.size ? 'both' : 'manual') : 'trip',
        first_visit: e.firstVisit || '',
        trip_count: e.trips.size,
        // Capped for a compact payload; companion_count keeps the true total.
        companion_count: e.companions.size,
        companions: [...e.companions]
          .slice(0, 12)
          .map((id: string) => personById.get(id) || { id, full_name: '', photo: '' }),
        trips: [...e.trips.values()]
          .sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')))
          .slice(0, 3),
      }))
      .sort((a: any, b: any) => String(b.first_visit || '').localeCompare(String(a.first_visit || '')) || a.code.localeCompare(b.code));

    const bucketList = [...bucket.values()].sort((a: any, b: any) => a.code.localeCompare(b.code));

    return Response.json({
      visited,
      bucket: bucketList,
      stats: {
        countries: visited.length,
        bucket: bucketList.length,
        trips: new Set([...stamped.values()].flatMap((e: any) => [...e.trips.keys()])).size,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not load the passport' }, { status: 500 });
  }
}