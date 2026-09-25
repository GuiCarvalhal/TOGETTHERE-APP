import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { resolveAirportPlace } from '../../shared/googlePlaces.ts';

// Resolve two airport IATA codes (from a selected flight result) to full
// Google Place records (place_id, name, address, lat, lng, country, IANA tz)
// so the journey form can store from_place/to_place at entry time — the same
// shape produced by the route-mode autocomplete selection. Used after the user
// picks a flight-number lookup result (where airports come from the API, not
// from a Google Places pick). Best-effort: a failed resolution returns null for
// that side so the form can still save with the IATA + tz from the flight data.
//
// Body: { from_iata, to_iata }  ->  { from_place, to_place, from_iata, to_iata }
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const fromIata = String(body.from_iata || '').trim().toUpperCase();
    const toIata = String(body.to_iata || '').trim().toUpperCase();
    if (!fromIata || !toIata) return Response.json({ error: 'from_iata and to_iata required' }, { status: 400 });

    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!mapsKey) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    const [fromPlace, toPlace] = await Promise.all([
      resolveAirportPlace(mapsKey, fromIata).catch(() => null),
      resolveAirportPlace(mapsKey, toIata).catch(() => null),
    ]);

    return Response.json({
      from_iata: fromIata,
      to_iata: toIata,
      from_place: fromPlace ? { ...fromPlace, iata: fromIata } : null,
      to_place: toPlace ? { ...toPlace, iata: toIata } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}