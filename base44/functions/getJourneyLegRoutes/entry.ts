import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fetchDrivingRoute } from '../../shared/googleDirections.ts';

// Batched driving directions for the daily distance/duration summary. Takes a
// list of inter-segment legs ({ origin, destination }) and returns one result
// per leg, in order, reusing the shared Google Maps Directions helper (same
// API + key as getRouteDetails). Dedups identical legs and never throws on a
// single leg failure — a failed/missing leg comes back as { ok: false } so the
// caller marks the day incomplete instead of zeroing an unknown transfer.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const legs = Array.isArray(body.legs) ? body.legs : [];
    if (!legs.length) return Response.json({ results: [] });
    if (legs.length > 60) return Response.json({ error: 'Too many legs' }, { status: 400 });

    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    // Dedup by origin|destination, preserving first-seen order.
    const unique = [];
    const seen = new Map();
    const legToUnique = legs.map(function (leg) {
      const origin = (leg && leg.origin ? String(leg.origin) : '').trim();
      const destination = (leg && leg.destination ? String(leg.destination) : '').trim();
      if (!origin || !destination) return -1;
      const ck = origin + '|' + destination;
      if (seen.has(ck)) return seen.get(ck);
      const idx = unique.length;
      seen.set(ck, idx);
      unique.push({ origin: origin, destination: destination });
      return idx;
    });

    const settled = await Promise.allSettled(
      unique.map(function (l) { return fetchDrivingRoute(key, l.origin, l.destination); })
    );
    const uniqueResults = settled.map(function (s) {
      if (s.status === 'fulfilled' && s.value.ok) {
        return {
          ok: true,
          distanceMeters: s.value.distanceMeters,
          durationSeconds: s.value.durationSeconds,
          distance: s.value.distance,
          duration: s.value.duration,
        };
      }
      return { ok: false, reason: 'no_route' };
    });

    const results = legToUnique.map(function (idx) {
      return idx === -1 ? { ok: false, reason: 'missing' } : uniqueResults[idx];
    });
    return Response.json({ results: results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}