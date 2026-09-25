import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { autocompletePlaces } from '../../shared/googlePlaces.ts';

// Google Places Autocomplete for the journey form. Returns type-ahead
// predictions [{ place_id, name, address }] for the text the user typed.
// `types` optionally restricts to a place type (e.g. "airport" for flight
// origin/destination). Uses GOOGLEMAPS_TOGETTHERE. Short/empty input returns an
// empty list so the client never fires an expensive query for < 2 chars.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const text = (body.text || '').trim();
    if (text.length < 2) return Response.json({ predictions: [] });
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });
    const types = body.types || '';
    const predictions = await autocompletePlaces(key, text, types || undefined);
    return Response.json({ predictions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}