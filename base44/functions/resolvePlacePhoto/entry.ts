import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { placeQueryForItem, resolveItemPhotoUrl } from '../../shared/journeyPhoto.ts';

// Resolves a small Google Places photo for a journey item's primary place,
// uploads it to permanent public storage, and caches the URL on the record
// (place_photo) so cards never re-fetch. Idempotent: returns the cached URL
// if already resolved. The read is RLS-scoped (only gathering members can
// resolve photos for their items); only the cache write uses the service role.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const itemId = (body.item_id || '').trim();
    if (!itemId) return Response.json({ error: 'item_id required' }, { status: 400 });
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    // RLS-enforced read — only members of the gathering can access this item.
    const item = await base44.entities.JourneyItem.get(itemId);
    if (item.place_photo) return Response.json({ photo_url: item.place_photo });

    if (!placeQueryForItem(item)) return Response.json({ error: 'No resolvable place for this item type' }, { status: 400 });

    const fileUrl = await resolveItemPhotoUrl(base44, item, key);
    if (!fileUrl) return Response.json({ error: 'No place photo found' }, { status: 404 });
    await base44.asServiceRole.entities.JourneyItem.update(itemId, { place_photo: fileUrl });
    return Response.json({ photo_url: fileUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}