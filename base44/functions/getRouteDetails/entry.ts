import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { fetchDrivingRoute } from '../../shared/googleDirections.ts';

// Driving distance + duration between two points via Google Maps Directions
// API. Uses GOOGLEMAPS_TOGETTHERE. The Google call + response shape live in the
// shared googleDirections helper (single source of truth with getJourneyLegRoutes);
// this keeps the original response fields so RouteDetailsCard is unchanged.
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

    const r = await fetchDrivingRoute(key, origin, destination);
    if (!r.ok) return Response.json({ error: r.error }, { status: 404 });
    return Response.json({
      distance: r.distance,
      duration: r.duration,
      durationInTraffic: r.durationInTraffic,
      startAddress: r.startAddress,
      endAddress: r.endAddress,
      mapsUrl: r.mapsUrl,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}