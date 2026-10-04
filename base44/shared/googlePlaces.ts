import { providerJson, ProviderFailure, invalidProviderShape } from './providerJson.ts';
import { alpha2ToAlpha3 } from './isoCountries.ts';

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
    id: p.id || '',
    name: p.displayName?.text || '',
    rating: p.rating ?? null,
    reviews: p.userRatingCount ?? null,
    address: p.formattedAddress || '',
    mapsUrl: p.googleMapsUri || '',
    summary: p.editorialSummary?.text || '',
  };
}

// Deduplicate a list of place lists by place identity (provider id, or
// name+address when id is absent), then cap to `max`. Used by
// generateRecommendations so multiple search legs can overlap without
// producing duplicate suggestions, and a single-destination gathering can
// still yield up to `max` unique real places. Never fabricates or pads.
export function dedupePlaces(lists: any[][], max: number): any[] {
  const seen = new Set();
  const result: any[] = [];
  for (const p of lists.flat()) {
    const key = p.id || `${p.name}::${p.address}`.toLowerCase();
    if (!seen.has(key)) { seen.add(key); result.push(p); }
  }
  return result.slice(0, max);
}

// Geocode a place name to { lat, lng, country }. The country is the ISO
// short_name from address_components (e.g. "IT", "US") so journey times can
// render with a location code. Returns null on any failure so callers can
// fall back to a named-area search without a location bias.
export async function geocode(key, address) {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    const r = data.results[0];
    const loc = r.geometry.location;
    const country = (r.address_components || []).find((c) => (c.types || []).includes('country'))?.short_name || '';
    return { lat: loc.lat, lng: loc.lng, country };
  } catch {
    return null;
  }
}

// IANA tz -> ISO country code fallback for when geocoding didn't yield a
// country (e.g. lat/lng passed directly). Covers the common zones in this app.
export const TZ_COUNTRY: Record<string, string> = {
  'Europe/Rome': 'IT', 'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES',
  'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH',
  'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Dublin': 'IE', 'Europe/Brussels': 'BE',
  'Europe/Copenhagen': 'DK', 'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Helsinki': 'FI',
  'Europe/Warsaw': 'PL', 'Europe/Prague': 'CZ', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO',
  'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
  'America/Anchorage': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Santiago': 'CL',
  'Asia/Tokyo': 'JP', 'Asia/Dubai': 'AE', 'Asia/Singapore': 'SG', 'Asia/Hong_Kong': 'HK',
  'Asia/Bangkok': 'TH', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Kuala_Lumpur': 'MY',
  'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Taipei': 'TW', 'Asia/Kolkata': 'IN',
  'Asia/Bahrain': 'BH', 'Asia/Qatar': 'QA', 'Asia/Tel_Aviv': 'IL',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Honolulu': 'US',
  'Africa/Cairo': 'EG', 'Africa/Casablanca': 'MA', 'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
};

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

// Google Places Autocomplete (New Places API v1) — type-ahead predictions.
// Returns [{ place_id, name, address }]. `types` optionally restricts to a
// place type (e.g. "airport" for flight origin/destination). Used by the
// searchPlaces backend function so the journey form can resolve a place at
// entry time instead of free-texting a location that must be re-geocoded later.
export async function autocompletePlaces(key, text, types) {
  const body = { input: text, languageCode: 'en' };
  if (types) body.includedPrimaryTypes = [types];
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return (data.suggestions || []).map((s) => {
    const p = s.placePrediction || {};
    const main = p.structuredFormat?.mainText?.text || p.text?.text || '';
    const secondary = p.structuredFormat?.secondaryText?.text || '';
    return {
      place_id: p.placeId || '',
      name: main,
      address: secondary ? `${main}, ${secondary}` : main,
    };
  }).filter((p) => p.place_id);
}

// Extract the best-fit city name from Google Places addressComponents, using
// the most specific administrative division available. Used by getPlaceDetails
// and resolveAirportPlace so flight cards show the real city (not the airport
// name or IATA code). Returns '' when no suitable component exists.
function cityFromComponents(components: any[]): string {
  if (!Array.isArray(components)) return '';
  // locality / postal_town are the reliable city sources. administrative_area_level_2
  // (longText only) is a fallback municipality; admin_area_level_1 (state/province)
  // is NEVER used — its shortText is a state code (e.g. "SP"), not a city. If none
  // of these exist, return '' (honest missing) rather than inventing a city.
  const preferred = ['locality', 'postal_town', 'administrative_area_level_2'];
  for (const t of preferred) {
    const c = components.find((c) => (c.types || []).includes(t));
    if (c) return c.longText || c.shortText || '';
  }
  return '';
}

// Place Details (New Places API v1) — resolve a place_id to full data.
// Returns { place_id, name, address, lat, lng, country, city } or null. Used by
// the resolvePlace backend function after the user selects an autocomplete
// prediction; the caller appends the IANA tz from the Time Zone API.
export async function getPlaceDetails(key, placeId) {
  const source = 'google.places';
  if (!key) throw new ProviderFailure(source, 'NOT_CONFIGURED', 'Place provider is not configured.', false);
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`;
  const p = await providerJson(url, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
    },
  }, source);
  if (p === null) return null;
  if (!p || p.id !== placeId || (p.addressComponents != null && !Array.isArray(p.addressComponents))) throw invalidProviderShape(source);
  const country = (p.addressComponents || []).find((c) => (c.types || []).includes('country'))?.shortText || '';
  const city = cityFromComponents(p.addressComponents);
  return {
    place_id: p.id || placeId,
    name: p.displayName?.text || '',
    address: p.formattedAddress || '',
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    country,
    country_alpha3: alpha2ToAlpha3(country),
    city,
  };
}

// Resolve an airport IATA code to a Google Place + IANA tz. Used by the flight
// lookup so origin/destination airports are resolved at entry time (place_id,
// name, address, lat, lng, country, tz) instead of storing a bare IATA string.
export async function resolveAirportPlace(key, iata) {
  const places = await searchText(key, `${iata} Airport`, undefined,
    'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents');
  const p = places[0];
  if (!p) return null;
  const country = (p.addressComponents || []).find((c) => (c.types || []).includes('country'))?.shortText || '';
  const lat = p.location?.latitude ?? null;
  const lng = p.location?.longitude ?? null;
  let tz = '';
  if (lat != null && lng != null) {
    const ts = Math.floor(Date.now() / 1000);
    const tzRes = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${ts}&key=${key}`);
    const tzData = await tzRes.json();
    if (tzData.status === 'OK') tz = tzData.timeZoneId;
  }
  const city = cityFromComponents(p.addressComponents);
  return {
    place_id: p.id || '',
    name: p.displayName?.text || iata,
    address: p.formattedAddress || '',
    lat, lng, country, country_alpha3: alpha2ToAlpha3(country), tz, city,
  };
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