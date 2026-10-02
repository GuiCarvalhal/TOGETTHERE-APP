import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { fetchAirportByIata, fetchFlightByNumber, AERO_DATA_VERSION } from '../../shared/aeroDataBox.ts';
import { getPlaceDetails } from '../../shared/googlePlaces.ts';
import { createFlightEnrichmentResolver } from '../../shared/flightEnrichment.ts';

// Initialized lazily inside an authenticated handler. Writes deploy the handler
// with the current shared helper; the response fingerprint verifies that path.
let resolver;
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json();
    const input = {
      flight_number: String(body.flight_number || '').trim().toUpperCase().replace(/\s+/g, ''),
      date: String(body.date || '').trim(),
      from_iata: String(body.from_iata || '').trim().toUpperCase(),
      to_iata: String(body.to_iata || '').trim().toUpperCase(),
      from_place_id: String(body.from_place_id || '').trim(),
      to_place_id: String(body.to_place_id || '').trim(),
    };
    if ((input.flight_number && !/^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/.test(input.flight_number)) ||
        (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) ||
        [input.from_iata, input.to_iata].some(value => value && !/^[A-Z]{3}$/.test(value)) ||
        [input.from_place_id, input.to_place_id].some(value => value.length > 256)) {
      return Response.json({ error: 'Invalid flight metadata lookup.' }, { status: 400 });
    }
    if (!resolver) {
      const rapidKey = secrets.get('RAPIDAPI_KEY');
      const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
      resolver = createFlightEnrichmentResolver({
        lookupFlight: (number, date) => fetchFlightByNumber(rapidKey, number, date),
        lookupAirport: iata => fetchAirportByIata(rapidKey, iata),
        lookupPlace: placeId => getPlaceDetails(mapsKey, placeId),
        helperVersion: AERO_DATA_VERSION,
      });
    }
    return Response.json(await resolver(input), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error instanceof SyntaxError ? 400 : 500 });
  }
}