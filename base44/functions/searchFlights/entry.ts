import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { resolveAirportPlace } from '../../shared/googlePlaces.ts';

// Flight lookup via AeroDataBox on RapidAPI (RAPIDAPI_KEY). Given a flight
// number + date, returns carrier, origin/destination airport (IATA + resolved
// Google Place with lat/lng/country/IANA tz), and the scheduled departure/
// arrival date-times as airport-LOCAL wall-clock values ("YYYY-MM-DDTHH:MM")
// so the form can pre-fill its datetime-local inputs in the airport's own
// timezone. Degrades gracefully: if the airport place can't be resolved the
// flight data is still returned with empty place fields.
function wallTime(localStr) {
  if (!localStr) return '';
  // AeroDataBox local looks like "2025-09-14 16:45+02:00" or
  // "2025-09-14T16:45:00+02:00" — the wall clock is airport-local. Take the
  // leading YYYY-MM-DDTHH:MM so it drops straight into a datetime-local input.
  return String(localStr).replace(' ', 'T').slice(0, 16);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const flightNumber = (body.flight_number || '').trim();
    if (!flightNumber) return Response.json({ error: 'Enter a flight number (e.g. AA123).' }, { status: 400 });
    if (!/^[A-Za-z]{2,3}\d{1,4}$/.test(flightNumber)) return Response.json({ error: 'That doesn\'t look like a flight number. Use the airline code plus number, e.g. AA123.' }, { status: 400 });
    const date = (body.date || new Date().toISOString().slice(0, 10)).trim();

    const key = secrets.get('RAPIDAPI_KEY');
    if (!key) return Response.json({ error: 'RapidAPI key (RAPIDAPI_KEY) not configured' }, { status: 500 });
    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');

    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    });
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) {
        return Response.json({ error: 'No flight found. Check the flight number (e.g. AA123) and date, then try again.' }, { status: 404 });
      }
      return Response.json({ error: 'Flight lookup is unavailable right now. Try again in a moment.' }, { status: 502 });
    }
    // AeroDataBox sometimes returns 200 with an empty body for unknown flights;
    // parse defensively so a bad/unknown number yields a friendly 404, not a 500.
    const raw = await res.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : [];
    } catch {
      return Response.json({ error: 'No flight found for that number and date.' }, { status: 404 });
    }
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return Response.json({ error: 'No flight found for that number and date.' }, { status: 404 });

    const f = list[0];
    const fromIata = f.departure?.airport?.iata || f.departure?.airport?.name || '';
    const toIata = f.arrival?.airport?.iata || f.arrival?.airport?.name || '';

    // Resolve both airports to Google Places + IANA tz so the form can store
    // from_place/to_place at entry time (no later re-geocode). Best-effort: if
    // the Maps key isn't configured or resolution fails, the flight data is
    // still returned with null place fields so the form can fall back to text.
    let fromPlace = null;
    let toPlace = null;
    if (mapsKey) {
      [fromPlace, toPlace] = await Promise.all([
        fromIata ? resolveAirportPlace(mapsKey, fromIata).catch(() => null) : null,
        toIata ? resolveAirportPlace(mapsKey, toIata).catch(() => null) : null,
      ]);
    }

    return Response.json({
      flight: {
        number: f.number || flightNumber,
        airline: f.airline?.name || '',
        status: f.status || '',
        from: fromIata,
        to: toIata,
        from_city: f.departure?.airport?.name || fromPlace?.name || '',
        to_city: f.arrival?.airport?.name || toPlace?.name || '',
        from_place: fromPlace,
        to_place: toPlace,
        departure: wallTime(f.departure?.scheduledTime?.local || f.departure?.scheduledTime?.utc || ''),
        arrival: wallTime(f.arrival?.scheduledTime?.local || f.arrival?.scheduledTime?.utc || ''),
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}