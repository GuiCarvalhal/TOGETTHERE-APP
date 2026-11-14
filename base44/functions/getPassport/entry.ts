import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { TZ_COUNTRY } from '../../shared/googlePlaces.ts';

// The user's passport: every country their own gatherings took them to, plus the
// countries they added by hand (visited) or put on their bucket list.
//
// Stamps are DERIVED, never copied: a country is stamped because a live journey
// item of a gathering the user belongs to resolves to that country, so editing a
// trip updates the passport with no sync job and nothing to back-fill. Only the
// manual additions live in PassportCountry rows.
const ISO2 = /^[A-Z]{2}$/;

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
    // a traveller even when no Member row was ever written for them.
    const [byId, byEmail, owned] = await Promise.all([
      svc.Member.filter({ user_id: user.id }).catch(() => []),
      email ? svc.Member.filter({ email }).catch(() => []) : [],
      svc.Gathering.filter({
        $or: [
          { owner_user_id: user.id },
          { created_by_id: user.id },
          { member_user_ids: { $in: [user.id] } },
        ],
      }).catch(() => []),
    ]);
    const gatheringIds = [...new Set([
      ...[...(byId || []), ...(byEmail || [])].map((m: any) => m.gathering_id).filter(Boolean),
      ...(owned || []).map((g: any) => g.id).filter(Boolean),
    ])].slice(0, 200);

    const [gatherings, items, saved] = await Promise.all([
      gatheringIds.length ? svc.Gathering.filter({ id: { $in: gatheringIds } }).catch(() => []) : [],
      gatheringIds.length ? svc.JourneyItem.filter({ gathering_id: { $in: gatheringIds } }).catch(() => []) : [],
      svc.PassportCountry.filter({ target_user_keys: { $in: keys } }).catch(() => []),
    ]);

    const tripById = new Map(
      (gatherings || [])
        .filter((g: any) => !g.is_deleted)
        .map((g: any) => [g.id, { id: g.id, name: g.name || '', date: dayOf(g.start_date) }]),
    );

    // ── Stamps earned on real trips ─────────────────────────────────────
    const stamped = new Map();
    for (const item of items || []) {
      if (item.is_deleted) continue;
      const trip: any = tripById.get(item.gathering_id);
      if (!trip) continue;
      const day = dayOf(item.start_datetime) || dayOf(item.end_datetime);
      const codes = new Set(
        [countryOf(item.place), countryOf(item.from_place), countryOf(item.to_place)].filter(Boolean),
      );
      for (const code of codes) {
        const entry: any = stamped.get(code) || { code, firstVisit: '', trips: new Map(), manual: false };
        if (day && (!entry.firstVisit || day < entry.firstVisit)) entry.firstVisit = day;
        entry.trips.set(trip.id, trip);
        stamped.set(code, entry);
      }
    }

    // ── Additions the user made by hand ─────────────────────────────────
    const bucket = new Map();
    for (const row of saved || []) {
      const code = String(row.country_code || '').trim().toUpperCase();
      if (!ISO2.test(code)) continue;
      if (row.status === 'visited') {
        const entry: any = stamped.get(code) || { code, firstVisit: '', trips: new Map(), manual: false };
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