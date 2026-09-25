import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns the Google Maps JS API key (GOOGLEMAPS_TOGETTHERE) so the client can
// render an interactive segment map (markers + polyline + fit-bounds). Same key
// the backend already uses for Places/Geocoding — no new provider, no second
// key. Mirrors the getOneSignalConfig pattern. Authenticated users only.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const mapsKey = process.env.GOOGLEMAPS_TOGETTHERE || '';
    return Response.json({ mapsKey, configured: Boolean(mapsKey) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}