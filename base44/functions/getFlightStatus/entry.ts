import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { resolveLiveFlight } from '../../shared/flightStatus.ts';

// Live flight status for ONE item, read through the shared cache (see
// shared/flightStatus.ts for the refresh policy: 6h normally, every load from
// 4h before departure, 30 min backoff after a provider failure). Returns the
// terminal and gate exactly as the airline feed has them — an empty gate means
// the airline has not published one yet, never "it will appear in N hours".
const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Calendar date of an instant in the departure airport's own timezone: the
// provider files a flight by the airline's operating date, not the UTC one.
function localDate(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const flightNumber = text(body.flight_number);
    if (!flightNumber) return Response.json({ error: 'flight_number required' }, { status: 400 });

    const departureAt = text(body.departure_at);
    const originTz = text(body.origin_timezone);
    const date = text(body.date) || departureAt.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const dates = [...new Set([date, localDate(departureAt, originTz)].filter(Boolean))];

    const rapidKey = secrets.get('RAPIDAPI_KEY');
    if (!rapidKey) return Response.json({ error: 'RapidAPI key not configured' }, { status: 500 });

    const { flight, fetchedAt, stale } = await resolveLiveFlight(base44, {
      rapidKey,
      codes: [flightNumber],
      dates,
      departureAt,
      force: body.force === true,
    });

    const side = (s) => ({
      airport: text(s?.name) || text(s?.iata),
      iata: text(s?.iata),
      scheduled: text(s?.scheduled),
      actual: text(s?.actual),
      revised: text(s?.revised),
      terminal: text(s?.terminal),
      gate: text(s?.gate),
    });

    return Response.json({
      found: !!flight,
      status: text(flight?.status),
      number: text(flight?.number) || flightNumber,
      airline: text(flight?.airline),
      lastUpdatedUtc: text(flight?.lastUpdatedUtc),
      departure: side(flight?.departure),
      arrival: side(flight?.arrival),
      aircraft: { model: text(flight?.aircraft?.model), reg: text(flight?.aircraft?.reg) },
      fetchedAt,
      stale,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}