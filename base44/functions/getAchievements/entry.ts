import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Achievement stats for the signed-in user. Returns COUNTS ONLY — the badge
// catalog and every label live in the client, so this function stays a cheap,
// cacheable aggregation and the copy follows the app language.
//
// Everything is scoped to the caller: their memberships, the gatherings those
// memberships point at, and their own rows (notes, imports, mailboxes). Service
// role is used only to read across the gatherings the user already belongs to,
// never to widen the audience of the response.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole.entities;
    const email = String(user.email || '').trim().toLowerCase();

    // ── Memberships (the user's rows, healed id-keyed ones first) ───────────
    const byId = await svc.Member.filter({ user_id: user.id }).catch(() => []);
    const byEmail = email ? await svc.Member.filter({ email }).catch(() => []) : [];
    const memberRows = [];
    const seenMemberIds = new Set();
    for (const row of [...(byId || []), ...(byEmail || [])]) {
      if (!row?.id || seenMemberIds.has(row.id)) continue;
      seenMemberIds.add(row.id);
      memberRows.push(row);
    }

    const roles = { owner: 0, admin: 0, member: 0, viewer: 0 };
    for (const row of memberRows) {
      if (roles[row.role] !== undefined) roles[row.role] += 1;
    }
    const gatheringIds = [...new Set(memberRows.map((m) => m.gathering_id).filter(Boolean))].slice(0, 200);

    const gatherings = gatheringIds.length
      ? await svc.Gathering.filter({ id: { $in: gatheringIds } }).catch(() => [])
      : [];
    const gatheringList = Array.isArray(gatherings) ? gatherings : [];

    const organizer = gatheringList.filter((g) => g.owner_user_id === user.id || g.created_by_id === user.id).length;

    // ── Co-travelers: distinct people across every gathering ────────────────
    const coTravelers = new Set();
    if (gatheringIds.length) {
      const allMembers = await svc.Member.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []);
      for (const m of allMembers || []) {
        const key = m.user_id || String(m.email || '').trim().toLowerCase();
        if (!key) continue;
        if (key === user.id || (email && key === email)) continue;
        coTravelers.add(key);
      }
    }

    // ── Journey items across those gatherings ───────────────────────────────
    const items = gatheringIds.length
      ? await svc.JourneyItem.filter({ gathering_id: { $in: gatheringIds } }).catch(() => [])
      : [];
    const liveItems = (items || []).filter((i) => !i.is_deleted);
    const flights = liveItems.filter((i) => i.type === 'flight').length;
    const stays = liveItems.filter((i) => i.type === 'hotel').length;
    const destinations = new Set();
    for (const item of liveItems) {
      const label = item.to_place?.country
        || item.to_place?.city
        || item.place?.country
        || item.place?.city
        || item.location_to
        || item.location_name;
      if (label) destinations.add(String(label).trim().toLowerCase());
    }

    // ── Expenses ────────────────────────────────────────────────────────────
    const expenses = gatheringIds.length
      ? await svc.Expense.filter({ gathering_id: { $in: gatheringIds } }).catch(() => [])
      : [];
    const liveExpenses = (expenses || []).filter((e) => !e.is_deleted);
    const currencies = new Set(liveExpenses.map((e) => e.currency).filter(Boolean));

    // ── The user's own contributions ────────────────────────────────────────
    const [notes, filedImports, mailboxes, activity, families] = await Promise.all([
      svc.JourneyNote.filter({ created_by_id: user.id }).catch(() => []),
      svc.JourneyInboxItem.filter({ owner_user_id: user.id, status: 'filed' }).catch(() => []),
      svc.InboxConnection.filter({ target_user_id: user.id }).catch(() => []),
      svc.Activity.filter({ actor_user_id: user.id }).catch(() => []),
      svc.Family.filter({ $or: [{ owner_user_id: user.id }, { member_user_ids: { $in: [user.id] } }] }).catch(() => []),
    ]);

    const familyList = Array.isArray(families) ? families : [];
    const familySize = familyList.reduce((max, f) => Math.max(max, (f.member_user_ids || []).length), 0);

    // ── Profile depth: the four things that make a member discoverable ──────
    let profile = 0;
    if (user.photo || user.picture) profile += 1;
    if (user.home_city) profile += 1;
    if (Array.isArray(user.interests) && user.interests.length) profile += 1;
    if (Array.isArray(user.dietary_preferences) && user.dietary_preferences.length) profile += 1;

    const createdAt = Date.parse(user.created_date || '') || Date.now();
    const daysActive = Math.max(0, Math.floor((Date.now() - createdAt) / 86400000));

    return Response.json({
      stats: {
        daysActive,
        gatherings: gatheringIds.length,
        organizer,
        captain: roles.admin + roles.owner,
        companions: coTravelers.size,
        segments: liveItems.length,
        flights,
        stays,
        destinations: destinations.size,
        expenses: liveExpenses.length,
        currencies: currencies.size,
        mailboxes: (mailboxes || []).length,
        imports: (filedImports || []).length,
        notes: (notes || []).length,
        activity: (activity || []).length,
        families: familyList.length,
        familySize,
        profile,
      },
    });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not compute achievements' }, { status: 500 });
  }
}