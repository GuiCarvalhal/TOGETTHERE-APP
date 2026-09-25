import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Live flight status via AeroDataBox (RapidAPI). Returns rich departure/arrival
// times (destination-local, with offset), terminals, gates, aircraft details and
// a last-updated timestamp. On any failure returns an error status so the caller
// can hide the card gracefully — never surfaces an error to the end user.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const flightNumber = (body.flight_number || '').trim();
    if (!flightNumber) return Response.json({ error: 'flight_number required' }, { status: 400 });
    const date = (body.date || new Date().toISOString().slice(0, 10)).trim();

    const key = secrets.get('RAPIDAPI_KEY');
    if (!key) return Response.json({ error: 'RapidAPI key not configured' }, { status: 500 });

    const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(flightNumber)}/${date}`;
    const res = await fetch(url, {
      headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com' },
    });
    if (!res.ok) return Response.json({ error: `AeroDataBox request failed (${res.status})` }, { status: 502 });
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return Response.json({ error: 'No flight found' }, { status: 404 });

    const f = list[0];
    const dep = f.departure || {};
    const arr = f.arrival || {};
    const ac = f.aircraft || {};
    return Response.json({
      status: f.status || '',
      number: f.number || flightNumber,
      airline: f.airline?.name || '',
      lastUpdatedUtc: f.lastUpdatedUtc || '',
      departure: {
        airport: dep.airport?.name || dep.airport?.iata || '',
        iata: dep.airport?.iata || '',
        scheduled: dep.scheduledTime?.local || '',
        actual: dep.actualTime?.local || '',
        revised: dep.revisedTime?.local || '',
        terminal: dep.terminal || '',
        gate: dep.gate || '',
      },
      arrival: {
        airport: arr.airport?.name || arr.airport?.iata || '',
        iata: arr.airport?.iata || '',
        scheduled: arr.scheduledTime?.local || '',
        actual: arr.actualTime?.local || '',
        revised: arr.revisedTime?.local || '',
        terminal: arr.terminal || '',
        gate: arr.gate || '',
      },
      aircraft: {
        model: ac.model || '',
        reg: ac.reg || '',
        airline: ac.airlineName || '',
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}