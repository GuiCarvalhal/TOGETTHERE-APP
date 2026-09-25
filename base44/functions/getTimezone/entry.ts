import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { geocode, TZ_COUNTRY } from '../../shared/googlePlaces.ts';

// Resolve a place name (or lat/lng) to an IANA timezone id (e.g. "Europe/Rome")
// via Google Geocoding + Time Zone API. Uses GOOGLEMAPS_TOGETTHERE. A per-cold-
// start module cache keeps repeated lookups free. This is the single source of
// place-timezones for the whole app — every displayed time is rendered in the
// tz this returns, never the viewer's device timezone.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const place = (body.place || '').trim();
    let lat = body.lat;
    let lng = body.lng;

    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    if (place) {
      const cached = tzCache.get(place.toLowerCase());
      if (cached) return Response.json({ timeZoneId: cached });
    }
    let countryCode = '';
    if (lat == null || lng == null) {
      if (!place) return Response.json({ error: 'place or lat/lng required' }, { status: 400 });
      let g = await geocode(key, place);
      // IATA airport codes (e.g. "JFK", "NAP") don't geocode on their own —
      // qualify them so they land at the airport, not a same-named town.
      if (!g && /^[A-Z]{2,3}$/.test(place)) {
        g = await geocode(key, `${place} Airport`);
        if (!g) g = await geocode(key, `${place} International Airport`);
      }
      if (!g) return Response.json({ error: 'Could not geocode place' }, { status: 404 });
      lat = g.lat;
      lng = g.lng;
      countryCode = g.country || '';
    }

    const ts = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.timeZoneId) {
      return Response.json({ error: data.errorMessage || data.status || 'timezone lookup failed' }, { status: 502 });
    }
    // ISO country code: from the geocoded address_components, or a tz fallback.
    if (!countryCode) countryCode = TZ_COUNTRY[data.timeZoneId] || '';
    if (place) tzCache.set(place.toLowerCase(), data.timeZoneId);
    return Response.json({
      timeZoneId: data.timeZoneId,
      countryCode,
      timeZoneName: data.timeZoneName || '',
      rawOffset: data.rawOffset,
      dstOffset: data.dstOffset,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Per-cold-start cache: place (lowercased) -> IANA tz id.
const tzCache = new Map();