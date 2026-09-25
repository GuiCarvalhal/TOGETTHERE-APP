import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';

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

    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.editorialSummary',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'en' }),
    });
    const data = await res.json();
    const p = data.places?.[0];
    if (!p) return Response.json({ error: 'No place found' }, { status: 404 });
    return Response.json({
      name: p.displayName?.text || '',
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? null,
      summary: p.editorialSummary?.text || '',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}