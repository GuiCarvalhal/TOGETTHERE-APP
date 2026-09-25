import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

// Driving distance + duration between two points via Google Maps Directions API.
// Uses GOOGLEMAPS_TOGETTHERE. Returns text distances/durations for the first leg.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const origin = (body.origin || '').trim();
    const destination = (body.destination || '').trim();
    if (!origin || !destination) return Response.json({ error: 'origin and destination required' }, { status: 400 });

    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    // departure_time as a Unix timestamp enables duration_in_traffic (live
    // traffic estimate) when the route supports it.
    const ts = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&departure_time=${ts}&traffic_model=best_guess&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.routes?.length) {
      return Response.json({ error: data.error_message || data.status || 'No route found' }, { status: 404 });
    }
    const leg = data.routes[0].legs[0];
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    return Response.json({
      distance: leg.distance?.text || '',
      duration: leg.duration?.text || '',
      durationInTraffic: leg.duration_in_traffic?.text || '',
      startAddress: leg.start_address || '',
      endAddress: leg.end_address || '',
      mapsUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}