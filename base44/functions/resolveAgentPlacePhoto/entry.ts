import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { searchPlacePhotos, fetchPhotoBlob } from '../../shared/googlePlaces.ts';

// Resolves a small Google Places photo for an AI-suggested place (the Agent
// concierge page), uploads it to permanent public storage, and returns the URL.
// Same pipeline as resolvePlacePhoto (searchPlacePhotos -> fetchPhotoBlob ->
// UploadPublicFile, same GOOGLEMAPS_TOGETTHERE key) but keyed by place name +
// address instead of a journey item — agent places are transient results from
// generateRecommendations and are not stored as records, so there is nothing
// to cache the URL on (the client caches it in localStorage instead).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const address = (body.address || '').trim();
    if (!name) return Response.json({ error: 'name required' }, { status: 400 });
    const key = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!key) return Response.json({ error: 'Google Maps key not configured' }, { status: 500 });

    // Search by the full place name; append the address for disambiguation.
    const query = address ? `${name}, ${address}` : name;
    const photos = await searchPlacePhotos(key, query);
    if (!photos.length) return Response.json({ error: 'No place photo found' }, { status: 404 });
    const blob = await fetchPhotoBlob(key, photos[0].name, 400);
    if (!blob) return Response.json({ error: 'Could not fetch photo' }, { status: 502 });

    // UploadPublicFile expects a File (name + type), not a bare Blob.
    const file = new File([blob], 'agent-place.jpg', { type: blob.type || 'image/jpeg' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
    const fileUrl = uploaded.file_url;
    if (!fileUrl) return Response.json({ error: 'Upload failed' }, { status: 502 });
    return Response.json({ photo_url: fileUrl });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}