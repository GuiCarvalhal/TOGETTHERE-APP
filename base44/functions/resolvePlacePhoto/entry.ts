import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { searchPlacePhotos, fetchPhotoBlob } from '../../shared/googlePlaces.ts';

// Build a Google Places search query for a journey item's primary place.
// - hotel/activity → the venue name (location_name)
// - flight → destination airport (IATA codes qualified with " Airport")
// - car/train/cruise → the destination endpoint
function placeQueryForItem(item) {
  if (!item) return '';
  const t = item.type;
  if (t === 'hotel' || t === 'activity') return (item.location_name || '').trim();
  if (t === 'flight') {
    const loc = (item.location_to || item.location_from || '').trim();
    if (!loc) return '';
    return /^[A-Z]{2,3}$/.test(loc) ? `${loc} Airport` : loc;
  }
  if (t === 'car' || t === 'train' || t === 'cruise') {
    return (item.location_to || item.location_from || '').trim();
  }
  return '';
}

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

    const query = placeQueryForItem(item);
    if (!query) return Response.json({ error: 'No resolvable place for this item type' }, { status: 400 });

    const photos = await searchPlacePhotos(key, query);
    if (!photos.length) return Response.json({ error: 'No place photo found' }, { status: 404 });
    const blob = await fetchPhotoBlob(key, photos[0].name, 400);
    if (!blob) return Response.json({ error: 'Could not fetch photo' }, { status: 502 });

    // UploadPublicFile expects a File (with name + type), not a bare Blob.
    const file = new File([blob], 'place-photo.jpg', { type: blob.type || 'image/jpeg' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
    const fileUrl = uploaded.file_url;
    if (!fileUrl) return Response.json({ error: 'Upload failed' }, { status: 502 });
    await base44.asServiceRole.entities.JourneyItem.update(itemId, { place_photo: fileUrl });
    return Response.json({ photo_url: fileUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}