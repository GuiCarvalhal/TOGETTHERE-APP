import { searchPlacePhotos, fetchPhotoBlob } from './googlePlaces.ts';

// Build a Google Places search query for a journey item's primary place.
// - hotel/activity → the venue name (location_name)
// - flight → destination airport (IATA codes qualified with " Airport")
// - car/train/cruise → the destination endpoint
export function placeQueryForItem(item) {
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

// The place-defining fields per item type. When any of these change on edit,
// a stale cached place_photo should be re-resolved.
export function placeDefiningFields(type) {
  if (type === 'hotel' || type === 'activity') return ['location_name'];
  if (['flight', 'car', 'train', 'cruise'].includes(type)) return ['location_to', 'location_from'];
  return [];
}

// Resolve a small Google Places photo for a journey item's primary place,
// upload it to permanent public storage, and return the public URL. Returns
// null when there is no resolvable place, no photo is found, or the upload
// fails — callers keep the existing cached value (if any). Does NOT write the
// record; the caller persists place_photo alongside the create/update so
// there is no extra write. The Google Maps key is read from app secrets.
export async function resolveItemPhotoUrl(base44, item, key) {
  if (!key) return null;
  const query = placeQueryForItem(item);
  if (!query) return null;
  try {
    const photos = await searchPlacePhotos(key, query);
    if (!photos.length) return null;
    const blob = await fetchPhotoBlob(key, photos[0].name, 400);
    if (!blob) return null;
    const file = new File([blob], 'place-photo.jpg', { type: blob.type || 'image/jpeg' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPublicFile({ file });
    return uploaded?.file_url || null;
  } catch {
    return null;
  }
}