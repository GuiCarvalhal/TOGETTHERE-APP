import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Flight lookup via AeroDataBox on RapidAPI. Uses RAPIDAPI_KEY.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const flightNumber = (body.flight_number || '').trim();
    if (!flightNumber) return Response.json({ error: 'flight_number required (e.g. AA123)' }, { status: 400 });
    const date = (body.date || new Date().toISOString().slice(0, 10)).trim();

    const key = secrets.get('RAPIDAPI_KEY');
    if (!key) return Response.json({ error: 'RapidAPI key (RAPIDAPI_KEY) not configured' }, { status: 500 });

    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': key,
        'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com',
      },
    });
    if (!res.ok) {
      const t = await res.text();
      return Response.json({ error: `AeroDataBox request failed (${res.status})` }, { status: 502 });
    }
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return Response.json({ error: 'No flight found for that number/date' }, { status: 404 });

    const f = list[0];
    return Response.json({
      flight: {
        number: f.number || flightNumber,
        airline: f.airline?.name || '',
        from: f.departure?.airport?.iata || f.departure?.airport?.name || '',
        to: f.arrival?.airport?.iata || f.arrival?.airport?.name || '',
        departure: f.departure?.scheduledTime?.local || f.departure?.scheduledTime?.utc || '',
        arrival: f.arrival?.scheduledTime?.local || f.arrival?.scheduledTime?.utc || '',
        status: f.status || '',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}