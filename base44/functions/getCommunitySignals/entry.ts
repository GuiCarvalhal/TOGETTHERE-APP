import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { countryOf, dayOf, isRealUserId } from '../../shared/passportShared.ts';

// Community signals for Passport & Awards: the people the user travelled with,
// what each of them has collected so far, and the trips still ahead.
//
// The badge catalog and its thresholds live in the client, so this function never
// decides who earned what. It returns the RAW per-person counts of the badge
// stats that can be derived from shared trip data, and the client compares them
// against the same catalog it uses for the user's own badges. Two people's
// awards therefore stay consistent forever, with nothing to re-sync when a tier
// changes.
//
// Scope is deliberately narrow: only people who share a gathering with the
// caller, and only counts computed from those shared gatherings. Private data
// (notes, imports, mailboxes, families) is never touched, so a badge based on it
// simply shows no faces.
const PEER_LIMIT = 24;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole.entities;
    const email = String(user.email || '').trim().toLowerCase();

    // ── The gatherings the caller is part of ─────────────────────────────
    const [byId, byEmail, ownerOf, created, aclMember] = await Promise.all([
      svc.Member.filter({ user_id: user.id }).catch(() => []),
      email ? svc.Member.filter({ email }).catch(() => []) : [],
      svc.Gathering.filter({ owner_user_id: user.id }).catch(() => []),
      svc.Gathering.filter({ created_by_id: user.id }).catch(() => []),
      svc.Gathering.filter({ member_user_ids: { $in: [user.id] } }).catch(() => []),
    ]);
    const gatheringIds = [...new Set([
      ...[...(byId || []), ...(byEmail || [])].map((m: any) => m.gathering_id).filter(Boolean),
      ...[...(ownerOf || []), ...(created || []), ...(aclMember || [])].map((g: any) => g.id).filter(Boolean),
    ])].slice(0, 200);
    if (!gatheringIds.length) return Response.json({ peers: [], upcoming: [] });

    const [gatheringRows, memberRows, itemRows, expenseRows] = await Promise.all([
      svc.Gathering.filter({ id: { $in: gatheringIds } }).catch(() => []),
      svc.Member.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []),
      svc.JourneyItem.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []),
      svc.Expense.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []),
    ]);

    const gatherings = (gatheringRows || []).filter((g: any) => !g.is_deleted);
    const gatheringById = new Map<string, any>(gatherings.map((g: any) => [g.id, g]));
    const liveItems = (itemRows || []).filter((i: any) => !i.is_deleted);
    const liveExpenses = (expenseRows || []).filter((e: any) => !e.is_deleted);

    // ── Who participates in each gathering (viewers only watch) ──────────
    const participantsByGathering = new Map<string, Set<string>>();
    const viewersByGathering = new Map<string, Set<string>>();
    const roleOf = new Map<string, string>();
    const personById = new Map<string, any>();
    const bucketOf = (gid: string) => {
      if (!participantsByGathering.has(gid)) {
        participantsByGathering.set(gid, new Set());
        viewersByGathering.set(gid, new Set());
      }
      return participantsByGathering.get(gid)!;
    };
    for (const m of memberRows || []) {
      const gid = String(m?.gathering_id || '');
      const uid = String(m?.user_id || '');
      if (!gid || !uid || !gatheringById.has(gid)) continue;
      if (m.role === 'viewer') { bucketOf(gid); viewersByGathering.get(gid)!.add(uid); continue; }
      bucketOf(gid).add(uid);
      roleOf.set(`${gid}:${uid}`, m.role || 'member');
      if (uid !== user.id && (m.full_name || m.photo) && !personById.has(uid)) {
        personById.set(uid, { id: uid, full_name: m.full_name || '', photo: m.photo || '' });
      }
    }
    for (const g of gatherings) {
      const set = bucketOf(g.id);
      const viewers = viewersByGathering.get(g.id)!;
      for (const raw of [...(g.participant_user_ids || []), ...(g.member_user_ids || [])]) {
        const uid = String(raw || '');
        if (isRealUserId(uid) && !viewers.has(uid)) set.add(uid);
      }
    }

    // Gatherings the caller genuinely travels on: owner/creator or participant.
    const myGatheringIds = [...new Set(gatherings
      .filter((g: any) => g.owner_user_id === user.id
        || g.created_by_id === user.id
        || (participantsByGathering.get(g.id) || new Set<string>()).has(user.id))
      .map((g: any) => g.id))];
    if (!myGatheringIds.length) return Response.json({ peers: [], upcoming: [] });
    const myGatheringSet = new Set(myGatheringIds);

    // ── Peers: everyone else on those gatherings, with their shared trips ──
    const sharedByPeer = new Map<string, Set<string>>();
    for (const gid of myGatheringIds) {
      for (const uid of participantsByGathering.get(gid) || []) {
        if (uid === user.id) continue;
        if (!sharedByPeer.has(uid)) sharedByPeer.set(uid, new Set());
        sharedByPeer.get(uid)!.add(gid);
      }
    }

    const stats = new Map<string, any>();
    for (const [uid, gids] of sharedByPeer) {
      const companions = new Set<string>();
      let organizer = 0;
      let captain = 0;
      for (const gid of gids) {
        for (const other of participantsByGathering.get(gid) || []) {
          if (other !== uid) companions.add(other);
        }
        const g: any = gatheringById.get(gid);
        if (g && (g.owner_user_id === uid || g.created_by_id === uid)) organizer += 1;
        const role = roleOf.get(`${gid}:${uid}`);
        if (role === 'owner' || role === 'admin') captain += 1;
      }
      stats.set(uid, {
        gatherings: gids.size,
        organizer,
        captain,
        companions: companions.size,
        segments: 0,
        flights: 0,
        stays: 0,
        destinations: new Set<string>(),
        expenses: 0,
        currencies: new Set<string>(),
      });
    }

    // ── Segments: a person counts a segment when they are on it ──────────
    const countriesByPeer = new Map<string, Set<string>>();
    for (const item of liveItems) {
      const gid = String(item.gathering_id || '');
      if (!myGatheringSet.has(gid)) continue;
      const attendees = (Array.isArray(item.attendee_user_ids) ? item.attendee_user_ids : [])
        .filter((v: any) => isRealUserId(v))
        .map((v: any) => String(v));
      const onItem = attendees.length
        ? new Set(attendees)
        : new Set(participantsByGathering.get(gid) || []);
      const creator = String(item.owner_id || '');
      if (isRealUserId(creator)) onItem.add(creator);

      const codes = [countryOf(item.place), countryOf(item.from_place), countryOf(item.to_place)].filter(Boolean);
      const destination = item.to_place?.country
        || item.to_place?.city
        || item.place?.country
        || item.place?.city
        || item.location_to
        || item.location_name;
      for (const uid of onItem) {
        const entry = stats.get(uid);
        if (!entry) continue;
        entry.segments += 1;
        if (item.type === 'flight') entry.flights += 1;
        if (item.type === 'hotel') entry.stays += 1;
        if (destination) entry.destinations.add(String(destination).trim().toLowerCase());
        if (codes.length) {
          if (!countriesByPeer.has(uid)) countriesByPeer.set(uid, new Set());
          for (const code of codes) countriesByPeer.get(uid)!.add(code);
        }
      }
    }

    // ── Expenses: payer or split participant ────────────────────────────
    for (const expense of liveExpenses) {
      const gid = String(expense.gathering_id || '');
      if (!myGatheringSet.has(gid)) continue;
      const people = new Set([expense.payer_user_id, ...(expense.participant_user_ids || [])]
        .filter((v: any) => isRealUserId(v))
        .map((v: any) => String(v)));
      for (const uid of people) {
        const entry = stats.get(uid);
        if (!entry) continue;
        entry.expenses += 1;
        if (expense.currency) entry.currencies.add(String(expense.currency));
      }
    }

    // Names/photos for peers without a member row: one batched read.
    const missing = [...stats.keys()].filter((uid) => !personById.has(uid)).slice(0, 120);
    if (missing.length) {
      const people = await svc.User.filter({ id: { $in: missing } }).catch(() => []);
      for (const u of people || []) {
        if (!personById.has(u.id)) personById.set(u.id, { id: u.id, full_name: u.full_name || '', photo: u.photo || '' });
      }
    }

    const peers = [...stats.entries()]
      .map(([uid, entry]: any) => {
        const person = personById.get(uid) || {};
        return {
          id: uid,
          full_name: person.full_name || '',
          photo: person.photo || '',
          stats: {
            gatherings: entry.gatherings,
            organizer: entry.organizer,
            captain: entry.captain,
            companions: entry.companions,
            segments: entry.segments,
            flights: entry.flights,
            stays: entry.stays,
            destinations: entry.destinations.size,
            expenses: entry.expenses,
            currencies: entry.currencies.size,
          },
          countries: [...(countriesByPeer.get(uid) || [])].slice(0, 60),
        };
      })
      .sort((a: any, b: any) => b.stats.gatherings - a.stats.gatherings || a.full_name.localeCompare(b.full_name))
      .slice(0, PEER_LIMIT);

    // ── Upcoming trips (what is still ahead) ────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const upcoming: any[] = [];
    for (const gid of myGatheringIds) {
      const g: any = gatheringById.get(gid);
      if (!g) continue;
      const future = liveItems
        .filter((i: any) => String(i.gathering_id) === gid)
        .filter((i: any) => {
          const day = dayOf(i.start_datetime) || dayOf(i.end_datetime);
          return day && day >= today;
        });
      let date = future.map((i: any) => dayOf(i.start_datetime) || dayOf(i.end_datetime)).sort()[0] || '';
      if (!date) {
        const stored = dayOf(g.start_date);
        if (stored && stored >= today) date = stored;
      }
      if (!date) continue;
      const codes = [...new Set(future.map((i: any) => countryOf(i.to_place) || countryOf(i.place)).filter(Boolean))];
      upcoming.push({ id: gid, name: g.name || '', date, countries: codes.slice(0, 4) });
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    return Response.json({ peers, upcoming: upcoming.slice(0, 3) });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not load community signals' }, { status: 500 });
  }
}