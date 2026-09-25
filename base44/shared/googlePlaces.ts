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