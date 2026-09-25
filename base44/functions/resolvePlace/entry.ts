import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { getPlaceDetails } from '../../shared/googlePlaces.ts';

// Resolve a Google Places place_id (from a searchPlaces prediction) to the full
// place record the journey form persists at entry time: place_id, canonical
// name, formatted_address, lat, lng, ISO country code, and the IANA timezone
// (via the Time Zone API from lat/lng). Uses GOOGLEMAPS_TOGETTHERE.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const placeId = (body.place_id || '').trim();
    if (!placeId) return Response.json({ error: 'place_id required' }, { status: 400 });
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    const details = await getPlaceDetails(key, placeId);
    if (!details) return Response.json({ error: 'Could not resolve place' }, { status: 404 });

    let tz = '';
    if (details.lat != null && details.lng != null) {
      const ts = Math.floor(Date.now() / 1000);
      const tzRes = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${details.lat},${details.lng}&timestamp=${ts}&key=${key}`);
      const tzData = await tzRes.json();
      if (tzData.status === 'OK') tz = tzData.timeZoneId;
    }
    return Response.json({ place: { ...details, tz } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}