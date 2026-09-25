import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { searchText, formatPlace } from '../../shared/googlePlaces.ts';

// Venue info (rating, review count, editorial summary) for a place name via the
// Google Places API (v1 searchText). Uses GOOGLEMAPS_TOGETTHERE. Returns the top
// match only; on any failure returns an error so the caller hides the block.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const query = (body.query || '').trim();
    if (!query) return Response.json({ error: 'query required' }, { status: 400 });
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });
    const places = await searchText(key, query, null, 'places.displayName,places.rating,places.userRatingCount,places.editorialSummary,places.formattedAddress,places.googleMapsUri');
    const p = places[0];
    if (!p) return Response.json({ error: 'No place found' }, { status: 404 });
    return Response.json(formatPlace(p));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}