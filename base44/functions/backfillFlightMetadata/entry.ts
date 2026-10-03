import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fetchAirportByIata, fetchNearestAirport } from '../../shared/aeroDataBox.ts';
import { getPlaceDetails } from '../../shared/googlePlaces.ts';
import { alpha2ToAlpha3 } from '../../shared/isoCountries.ts';

// One-time metadata-only backfill for legacy flight JourneyItems. Populates
// the stored route metadata that flight cards now render synchronously (no
// render-time API): origin/destination city, IATA airport code, IANA tz, ISO
// alpha-2 + alpha-3 country, and airline. Resolves missing fields using the
// EXISTING from_place/to_place (IATA or place_id) plus a one-time provider
// lookup (AeroDataBox airport-by-IATA, deduped; Google Places by place_id).
//
// Safety:
//  - Admin-only.
//  - Updates ONLY missing/new fields on from_place/to_place/airline. Never
//    touches id, title, confirmation_number, booking_reference, dates, notes,
//    attachments, attendee_user_ids, owner_id, owner_user_id, member_user_ids,
//    gathering_id, type, or any non-flight record.
//  - Preserves populated values unless demonstrably malformed (never overwrites
//    a non-empty field).
//  - Bounded: paginated, deduped airport lookups by IATA, sequential pacing.
//  - Idempotent: running again only fills still-missing fields.
//
// Body: { dry_run?: boolean, limit?: number }
// Returns: { total, updated, skipped, unresolved, errors, details[] }
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = !!body.dry_run;
    const limit = Math.min(Number(body.limit) || 500, 500);

    const rapidKey = secrets.get('RAPIDAPI_KEY');
    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');

    // Fetch all flight records (bounded, paginated).
    const flights: any[] = [];
    let cursor: string | undefined;
    do {
      const page: any = await base44.asServiceRole.entities.JourneyItem.filter(
        { type: 'flight' },
        { limit: 200, cursor, fields: ['id', 'title', 'confirmation_number', 'airline', 'from_place', 'to_place', 'location_from', 'location_to'] }
      );
      flights.push(...page.items);
      cursor = page.has_more ? page.next_cursor : undefined;
    } while (cursor && flights.length < limit);

    // Deduped airport-by-IATA cache: IATA -> { municipality, country, tz } | null.
    const airportCache = new Map<string, any | null>();
    async function lookupAirport(iata: string) {
      const key = iata.toUpperCase();
      if (airportCache.has(key)) return airportCache.get(key);
      let result: any = null;
      if (rapidKey && /^[A-Z]{3}$/.test(key)) {
        try {
          const a = await fetchAirportByIata(rapidKey, key);
          if (a) result = { city: a.municipality, country: a.country, tz: a.tz };
        } catch { /* transient — leave null, report unresolved */ }
      }
      airportCache.set(key, result);
      return result;
    }

    // Deduped Google Place cache: place_id -> { city, country, country_alpha3, lat, lng } | null.
    const placeCache = new Map<string, any | null>();
    async function lookupPlace(placeId: string) {
      if (placeCache.has(placeId)) return placeCache.get(placeId);
      let result: any = null;
      if (mapsKey && placeId) {
        try {
          const p = await getPlaceDetails(mapsKey, placeId);
          if (p) result = { city: p.city, country: p.country, country_alpha3: p.country_alpha3, lat: p.lat, lng: p.lng };
        } catch { /* transient */ }
      }
      placeCache.set(placeId, result);
      return result;
    }

    // Resolve an IANA tz from lat/lng via the Google Time Zone API.
    async function lookupTz(lat: number, lng: number): Promise<string> {
      if (!mapsKey) return '';
      try {
        const ts = Math.floor(Date.now() / 1000);
        const res = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${mapsKey}`);
        const data = await res.json();
        return data.status === 'OK' ? data.timeZoneId : '';
      } catch { return ''; }
    }

    // Deduped nearest-airport cache: "lat,lng" (rounded) -> { iata, city, country, tz } | null.
    const nearestCache = new Map<string, any | null>();
    async function lookupNearest(lat: number, lng: number) {
      const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      if (nearestCache.has(key)) return nearestCache.get(key);
      let result: any = null;
      if (rapidKey && isFinite(lat) && isFinite(lng)) {
        try {
          const a = await fetchNearestAirport(rapidKey, lat, lng);
          if (a) result = { iata: a.iata, city: a.municipality, country: a.country, tz: a.tz };
        } catch { /* transient */ }
      }
      nearestCache.set(key, result);
      return result;
    }

    // Extract IATA pair from a title like "DUB → OLB" or "GRU -> MIA".
    function iatasFromTitle(title: string): [string, string] {
      const m = (title || '').match(/\b([A-Z]{3})\b\s*(?:→|->|-)\s*\b([A-Z]{3})\b/);
      return m ? [m[1], m[2]] : ['', ''];
    }

    // Parse airline from a title like "Flight LX 1742 — SWISS" or "Air Canada AC095".
    // The flight number may contain a space ("LX 1742"), so use .+? for the
    // number token before the em-dash separator.
    function airlineFromTitle(title: string): string {
      const m1 = (title || '').match(/^[Ff]light\s+.+?\s+[—–-]\s+(.+)$/);
      if (m1) return m1[1].trim();
      const m2 = (title || '').match(/^(.+?)\s+[A-Z]{2}\d{1,4}$/);
      if (m2) return m2[1].trim();
      return '';
    }

    const details: any[] = [];
    let updated = 0, skipped = 0, unresolved = 0;
    const errors: any[] = [];

    for (const flight of flights) {
      const fp = flight.from_place || {};
      const tp = flight.to_place || {};
      const [titleFromIata, titleToIata] = iatasFromTitle(flight.title || '');

      // --- Resolve FROM side ---
      let fromChanged = false;
      const newFrom = { ...fp };
      // IATA: stored || title
      if (!newFrom.iata && titleFromIata) { newFrom.iata = titleFromIata; fromChanged = true; }
      // City / country / tz: prefer AeroDataBox by IATA, else Google Places by place_id
      const fromIata = newFrom.iata || '';
      const fromNeedsMeta = !newFrom.city || !newFrom.country || !newFrom.tz;
      if (fromNeedsMeta && fromIata) {
        const airport = await lookupAirport(fromIata);
        if (airport) {
          if (!newFrom.city && airport.city) { newFrom.city = airport.city; fromChanged = true; }
          if (!newFrom.country && airport.country) { newFrom.country = airport.country; fromChanged = true; }
          if (!newFrom.tz && airport.tz) { newFrom.tz = airport.tz; fromChanged = true; }
        }
      }
      if (fromNeedsMeta && !newFrom.city && newFrom.place_id) {
        const place = await lookupPlace(newFrom.place_id);
        if (place) {
          if (!newFrom.city && place.city) { newFrom.city = place.city; fromChanged = true; }
          if (!newFrom.country && place.country) { newFrom.country = place.country; fromChanged = true; }
        }
      }
      // tz via Time Zone API when we have coords but no tz
      if (!newFrom.tz && newFrom.lat != null && newFrom.lng != null) {
        const tz = await lookupTz(newFrom.lat, newFrom.lng);
        if (tz) { newFrom.tz = tz; fromChanged = true; }
      }
      // alpha-3 from whatever country we now have
      const fromAlpha3 = alpha2ToAlpha3(newFrom.country);
      if (!newFrom.country_alpha3 && fromAlpha3) { newFrom.country_alpha3 = fromAlpha3; fromChanged = true; }

      // --- Resolve TO side ---
      let toChanged = false;
      const newTo = { ...tp };
      if (!newTo.iata && titleToIata) { newTo.iata = titleToIata; toChanged = true; }
      const toIata = newTo.iata || '';
      const toNeedsMeta = !newTo.city || !newTo.country || !newTo.tz;
      if (toNeedsMeta && toIata) {
        const airport = await lookupAirport(toIata);
        if (airport) {
          if (!newTo.city && airport.city) { newTo.city = airport.city; toChanged = true; }
          if (!newTo.country && airport.country) { newTo.country = airport.country; toChanged = true; }
          if (!newTo.tz && airport.tz) { newTo.tz = airport.tz; toChanged = true; }
        }
      }
      if (toNeedsMeta && !newTo.city && newTo.place_id) {
        const place = await lookupPlace(newTo.place_id);
        if (place) {
          if (!newTo.city && place.city) { newTo.city = place.city; toChanged = true; }
          if (!newTo.country && place.country) { newTo.country = place.country; toChanged = true; }
        }
      }
      if (!newTo.tz && newTo.lat != null && newTo.lng != null) {
        const tz = await lookupTz(newTo.lat, newTo.lng);
        if (tz) { newTo.tz = tz; toChanged = true; }
      }
      const toAlpha3 = alpha2ToAlpha3(newTo.country);
      if (!newTo.country_alpha3 && toAlpha3) { newTo.country_alpha3 = toAlpha3; toChanged = true; }

      // --- Airline (only if missing) ---
      let airlineChanged = false;
      let newAirline = flight.airline || '';
      if (!newAirline) {
        const parsed = airlineFromTitle(flight.title || '');
        if (parsed) { newAirline = parsed; airlineChanged = true; }
      }

      const changed = fromChanged || toChanged || airlineChanged;
      const fromMissing = !newFrom.city || !newFrom.iata || !newFrom.tz || !newFrom.country_alpha3;
      const toMissing = !newTo.city || !newTo.iata || !newTo.tz || !newTo.country_alpha3;
      const stillUnresolved = fromMissing || toMissing;

      if (!changed) {
        skipped++;
        details.push({ id: flight.id, title: flight.title, status: stillUnresolved ? 'unresolved' : 'skipped', from: { city: newFrom.city, iata: newFrom.iata, tz: !!newFrom.tz, alpha3: newFrom.country_alpha3 }, to: { city: newTo.city, iata: newTo.iata, tz: !!newTo.tz, alpha3: newTo.country_alpha3 }, airline: newAirline });
        if (stillUnresolved) unresolved++;
        continue;
      }

      const updateFields: any = {};
      if (fromChanged) updateFields.from_place = newFrom;
      if (toChanged) updateFields.to_place = newTo;
      if (airlineChanged) updateFields.airline = newAirline;

      if (!dryRun) {
        try {
          await base44.asServiceRole.entities.JourneyItem.update(flight.id, updateFields);
        } catch (e: any) {
          errors.push({ id: flight.id, error: e.message });
          details.push({ id: flight.id, title: flight.title, status: 'error', error: e.message });
          continue;
        }
      }

      updated++;
      details.push({
        id: flight.id, title: flight.title, status: dryRun ? 'would_update' : 'updated',
        from: { city: newFrom.city, iata: newFrom.iata, tz: !!newFrom.tz, alpha3: newFrom.country_alpha3 },
        to: { city: newTo.city, iata: newTo.iata, tz: !!newTo.tz, alpha3: newTo.country_alpha3 },
        airline: newAirline,
        fields: { from_place: fromChanged, to_place: toChanged, airline: airlineChanged },
      });
      if (stillUnresolved) unresolved++;
    }

    return Response.json({
      total: flights.length,
      updated: dryRun ? 0 : updated,
      would_update: dryRun ? updated : 0,
      skipped,
      unresolved,
      errors,
      dry_run: dryRun,
      airport_lookups: airportCache.size,
      place_lookups: placeCache.size,
      details,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}