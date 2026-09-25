// Shared Google Places (New Places API v1) + Geocoding helpers.
// Used by getPlaceInfo and generateRecommendations so the Places fetch logic
// lives in one place.

export async function searchText(key, textQuery, locationBias, fieldMask) {
  const body = { textQuery, languageCode: 'en' };
  if (locationBias) body.locationBias = locationBias;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': fieldMask || 'places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri,places.editorialSummary',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return data.places || [];
}

export function formatPlace(p) {
  return {
    name: p.displayName?.text || '',
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    address: p.formattedAddress || '',
    mapsUrl: p.googleMapsUri || '',
    summary: p.editorialSummary?.text || '',
  };
}

// Geocode a place name to { lat, lng }. Returns null on any failure so callers
// can fall back to a named-area search without a location bias.
export async function geocode(key, address) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    const loc = data.results[0].geometry.location;
    return { lat: loc.lat, lng: loc.lng };
  } catch {
    return null;
  }
}

// Search Google Places (New Places API) for a text query, returning the first
// match's photo resource names (for place-photo thumbnails on journey cards).
export async function searchPlacePhotos(key, textQuery) {
  const body = { textQuery, languageCode: 'en' };
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'places.photos',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const place = (data.places || [])[0];
  return place?.photos || [];
}

// Fetch a Google Places photo as a Blob (server-side only; the API key never
// reaches the client). Returns null on any failure so callers can fall back.
export async function fetchPhotoBlob(key, photoName, maxWidthPx = 400) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.blob();
}

// Resolve an IANA timezone id (e.g. "Europe/Rome") for a place name via Google
// Geocoding + Time Zone API. Used by backend functions that must render times
// in the destination's local timezone (journey reminders). Returns null on any
// failure so callers can fall back to UTC.
export async function resolveTimezoneId(key, place) {
  try {
    const g = await geocode(key, place);
    if (!g) return null;
    const ts = Math.floor(Date.now() / 1000);
    const url = `https://maps.googleapis.com/maps/api/timezone/json?location=${g.lat},${g.lng}&timestamp=${ts}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.status === 'OK' ? data.timeZoneId : null;
  } catch {
    return null;
  }
}