import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { autocompletePlaces, getPlaceDetails, resolveAirportPlace, searchText } from '../../shared/googlePlaces.ts';

// One-time, idempotent coordinate backfill for legacy/beta JourneyItems that
// carry only free-text location strings (location_from/location_to/location_name)
// with empty from_place/to_place/place. Fills ONLY the canonical coordinate
// fields, in the SAME object shape the app writes at entry time
// ({ place_id, name, address, lat, lng, country, tz, iata }), and only when they
// are currently null. Never overwrites an existing value, never touches any
// other field, never creates or deletes records. A second run changes nothing.
//
// Resolution paths (mirroring entry-time resolution):
//  - route endpoints & point locations: searchPlaces (autocomplete) -> place_id
//    -> resolvePlace (getPlaceDetails + Time Zone API). Falls back to Places
//    searchText for lat/lng when autocomplete yields no prediction.
//  - flights with no location text but an "AAA -> BBB" IATA pair in the title:
//    resolveFlightAirports (resolveAirportPlace) for the full airport shape.
// Admin-only. Supports { dryRun: true|false } (defaults to true = no writes).

const ROUTE_TYPES = ['flight', 'car', 'train', 'cruise'];
const hasCoord = (p) => !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && isFinite(p.lat) && isFinite(p.lng);
// Owner-excluded items: explicitly reserved for manual fix. Never filled,
// even if a resolver returns a result, so this one-time backfill respects the
// owner's hold list.
const SKIP_IDS = new Set([
  '6aaf20d5f360be0bef770ca9', // Air Canada AC095 — no airports known
  '6aaf20c60cee43a1cd19dafc', // Catch by rude — no confident geocode
]);

async function fetchTz(key, lat, lng) {
  try {
    const ts = Math.floor(Date.now() / 1000);
    const r = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${key}`);
    const d = await r.json();
    return d.status === 'OK' ? d.timeZoneId : '';
  } catch { return ''; }
}

// Resolve a free-text location to the canonical place shape. isPoint items get
// the gathering destination appended as context when the name is short/bare,
// matching the runtime resolver's behaviour. Returns null when nothing resolves.
async function resolvePlaceFromText(key, text, isPoint, contextName) {
  let q = (text || '').trim();
  if (!q) return null;
  if (isPoint && contextName) {
    const looksQualified = q.includes(',') || q.split(/\s+/).length > 3;
    if (!looksQualified) q = `${q}, ${contextName}`;
  }
  // 1. autocomplete -> place_id -> details (full canonical shape)
  try {
    const preds = await autocompletePlaces(key, q);
    const pred = preds[0];
    if (pred?.place_id) {
      const det = await getPlaceDetails(key, pred.place_id);
      if (det && det.lat != null && det.lng != null) {
        const tz = await fetchTz(key, det.lat, det.lng);
        return { place_id: det.place_id, name: det.name, address: det.address, lat: det.lat, lng: det.lng, country: det.country, tz, iata: null };
      }
    }
  } catch { /* fall through */ }
  // 2. fallback: Places searchText for lat/lng (place_id may be null)
  try {
    const places = await searchText(key, q, null, 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents');
    const p = places[0];
    if (p) {
      const lat = p.location?.latitude ?? null, lng = p.location?.longitude ?? null;
      if (lat != null && lng != null) {
        const country = (p.addressComponents || []).find((c) => (c.types || []).includes('country'))?.shortText || '';
        const tz = await fetchTz(key, lat, lng);
        return { place_id: p.id || null, name: p.displayName?.text || '', address: p.formattedAddress || '', lat, lng, country, tz, iata: null };
      }
    }
  } catch { /* ignore */ }
  return null;
}

function parseIataPair(title) {
  const m = (title || '').match(/\b([A-Za-z]{3})\s*[→\-\u2192]\s*([A-Za-z]{3})\b/);
  return m ? [m[1].toUpperCase(), m[2].toUpperCase()] : null;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // safe default: dry-run unless explicitly false
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    const items = await base44.asServiceRole.entities.JourneyItem.list('-created_date', 500);
    const gatherings = await base44.asServiceRole.entities.Gathering.list('-created_date', 500);
    const gById = Object.fromEntries(gatherings.map((g) => [g.id, g]));
    const destName = (g) => g?.destination_places?.[0]?.name || g?.destinations?.[0] || '';

    // Collect the text lookups needed (deduped) + any IATA-pair flights.
    const work = []; // { itemId, role, text, isPoint, context }
    const iataItems = []; // { item, fromIata, toIata }
    for (const it of items) {
      const isRoute = ROUTE_TYPES.includes(it.type);
      if (isRoute) {
        if (!hasCoord(it.from_place) && it.location_from) work.push({ itemId: it.id, role: 'from_place', text: it.location_from, isPoint: false, context: '' });
        if (!hasCoord(it.to_place) && it.location_to) work.push({ itemId: it.id, role: 'to_place', text: it.location_to, isPoint: false, context: '' });
        if (!hasCoord(it.from_place) && !hasCoord(it.to_place) && !it.location_from && !it.location_to) {
          const pair = parseIataPair(it.title);
          if (pair) iataItems.push({ item: it, fromIata: pair[0], toIata: pair[1] });
        }
      } else if (!hasCoord(it.place) && it.location_name) {
        work.push({ itemId: it.id, role: 'place', text: it.location_name, isPoint: true, context: destName(gById[it.gathering_id]) });
      }
    }

    const textKey = (w) => `${w.isPoint ? 'p' : 'r'}::${w.context}::${w.text}`;
    const unique = new Map();
    for (const w of work) { const k = textKey(w); if (!unique.has(k)) unique.set(k, { text: w.text, isPoint: w.isPoint, context: w.context }); }
    const uniqKeys = [...unique.keys()];
    const resolved = {};
    const CONC = 6;
    for (let i = 0; i < uniqKeys.length; i += CONC) {
      await Promise.all(uniqKeys.slice(i, i + CONC).map(async (k) => {
        const u = unique.get(k);
        resolved[k] = await resolvePlaceFromText(key, u.text, u.isPoint, u.context);
      }));
    }

    const iataResolved = {}; // itemId -> { from_place, to_place }
    for (const w of iataItems) {
      const [fp, tp] = await Promise.all([
        resolveAirportPlace(key, w.fromIata).catch(() => null),
        resolveAirportPlace(key, w.toIata).catch(() => null),
      ]);
      iataResolved[w.item.id] = {
        from_place: fp ? { ...fp, iata: w.fromIata } : null,
        to_place: tp ? { ...tp, iata: w.toIata } : null,
      };
    }

    // Map resolved places back to items and apply updates.
    const byItem = new Map(); // itemId -> { role: textKey }
    for (const w of work) {
      const m = byItem.get(w.itemId) || {};
      m[w.role] = textKey(w);
      byItem.set(w.itemId, m);
    }

    const results = [];
    for (const it of items) {
      const entry = { id: it.id, title: it.title, type: it.type, gathering_id: it.gathering_id, changed: [], reason: null };
      if (SKIP_IDS.has(it.id)) { entry.reason = 'excluded — manual fix'; results.push(entry); continue; }
      const isRoute = ROUTE_TYPES.includes(it.type);
      const update = {};
      if (isRoute) {
        const m = byItem.get(it.id) || {};
        if (!hasCoord(it.from_place)) {
          const p = m.from_place ? resolved[m.from_place] : null;
          if (p) update.from_place = p;
          else if (iataResolved[it.id]?.from_place) update.from_place = iataResolved[it.id].from_place;
        }
        if (!hasCoord(it.to_place)) {
          const p = m.to_place ? resolved[m.to_place] : null;
          if (p) update.to_place = p;
          else if (iataResolved[it.id]?.to_place) update.to_place = iataResolved[it.id].to_place;
        }
      } else {
        const m = byItem.get(it.id) || {};
        if (!hasCoord(it.place)) {
          const p = m.place ? resolved[m.place] : null;
          if (p) update.place = p;
        }
      }
      const keys = Object.keys(update);
      if (keys.length) {
        entry.changed = keys;
        if (!dryRun) await base44.asServiceRole.entities.JourneyItem.update(it.id, update);
      } else {
        if (isRoute) {
          if (hasCoord(it.from_place) && hasCoord(it.to_place)) entry.reason = 'already has coords';
          else if (!it.location_from && !it.location_to && !iataResolved[it.id]) entry.reason = 'no location text';
          else entry.reason = 'unresolved';
        } else {
          if (hasCoord(it.place)) entry.reason = 'already has coords';
          else if (!it.location_name) entry.reason = 'no location text';
          else entry.reason = 'unresolved';
        }
      }
      results.push(entry);
    }

    const filled = results.filter((r) => r.changed.length > 0);
    return Response.json({
      dryRun,
      total: items.length,
      filledCount: filled.length,
      filled: filled.map((r) => ({ id: r.id, title: r.title, changed: r.changed })),
      skipped: results.filter((r) => r.changed.length === 0).map((r) => ({ id: r.id, title: r.title, reason: r.reason })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}