// Ingestion -> standard item form adapter.
//
// Turns a classifier draft (wall-clock strings, free-text places, no ids) into
// the SAME payload the standard form saves: resolved place objects, a UTC
// instant per datetime, the type's own fields only, and the contract's
// minimum-data rules. One adapter per type, all funnelling into
// buildStandardItemPayload/validateStandardItem:
//
//   flight                -> the standard flight flow: flight-number lookup
//                            (AeroDataBox) + airport places (Google Places, with
//                            the provider airport as fallback) + IANA tz
//   hotel / activity /    -> a single resolved place (autocomplete + details +
//   main_event / other       tz), exactly what the location picker stores
//   car / train / cruise  -> route endpoints (from → to) + per-endpoint tz
//
// A draft that misses the form's minimum data comes back as `incomplete` with
// explicit reason codes — the caller keeps it as a pending import instead of
// writing a half-empty item.

import {
  buildStandardItemPayload,
  normalizeItemType,
  validateStandardItem,
} from './journeyItemContract.ts';
import { wallDay, wallTimeToUtcIso } from './wallClock.ts';
import {
  searchText,
  getPlaceDetails,
  resolveAirportPlace,
  resolveTimezoneId,
  resolveTimezoneFromCoords,
} from './googlePlaces.ts';
import { fetchAirportByIata, fetchFlightByNumber } from './aeroDataBox.ts';

export type AdapterOutcome = {
  status: 'ready' | 'incomplete';
  adapter: string;
  payload: any;
  missing: string[];
};

function env(name: string) {
  try {
    const value = process.env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// "Roma Termini → Firenze" -> "Roma Termini" (the place half to geocode).
function firstOfRoute(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  const parts = raw.split(/\s*(?:→|->|–|—|>)\s*/).filter(Boolean);
  return parts[0] || raw;
}

function looksLikeIata(value: unknown) {
  return /^[A-Za-z]{3}$/.test(text(value)) ? text(value).toUpperCase() : '';
}

function normalizeFlightNumber(value: unknown) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

async function safe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

// Resolve free text to the place record the location picker persists
// (place_id/name/address/lat/lng/country/city + IANA tz).
async function placeForText(mapsKey: string, value: unknown) {
  const query = text(value);
  if (!mapsKey || query.length < 3) return { place: null, tz: '' };
  const rows = await safe(() => searchText(
    mapsKey, query, undefined,
    'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents',
  ));
  const first = (rows || [])[0];
  if (!first?.id) return { place: null, tz: '' };
  const details = await safe(() => getPlaceDetails(mapsKey, first.id));
  if (!details) return { place: null, tz: '' };
  const tz = (details.lat != null && details.lng != null)
    ? (await safe(() => resolveTimezoneFromCoords(mapsKey, details.lat, details.lng))) || ''
    : '';
  return { place: { ...details, tz }, tz };
}

async function tzForText(mapsKey: string, value: unknown) {
  const query = firstOfRoute(value);
  if (!mapsKey || query.length < 3) return '';
  return (await safe(() => resolveTimezoneId(mapsKey, query))) || '';
}

// Airport place: Google Places first (same record the flight flow stores), then
// the flight provider's airport record so a missing Places lookup still yields
// a usable { iata, name, city, country, tz }.
async function airportPlace(mapsKey: string, rapidKey: string, iata: string) {
  if (!iata) return null;
  if (mapsKey) {
    const place = await safe(() => resolveAirportPlace(mapsKey, iata));
    if (place) return { ...place, iata };
  }
  if (rapidKey) {
    const airport = await safe(() => fetchAirportByIata(rapidKey, iata));
    if (airport) {
      return {
        iata: airport.iata || iata,
        name: airport.name || iata,
        city: airport.municipality || '',
        country: airport.country || '',
        lat: airport.lat ?? undefined,
        lng: airport.lon ?? undefined,
        tz: airport.tz || '',
      };
    }
  }
  return null;
}

// --- per-type adapters -----------------------------------------------------

async function adaptFlight(draft: any, mapsKey: string, rapidKey: string) {
  const flightNumber = normalizeFlightNumber(draft.confirmation_number);
  const departureDate = wallDay(draft.start_datetime);
  let airline = text(draft.airline);
  let depIata = looksLikeIata(draft.location_from);
  let arrIata = looksLikeIata(draft.location_to);

  // Same lookup the standard flight flow runs after a number search.
  if (flightNumber && departureDate && rapidKey) {
    const flight = await safe(() => fetchFlightByNumber(rapidKey, flightNumber, departureDate));
    if (flight) {
      airline = airline || text(flight.airline);
      depIata = depIata || text(flight.dep_iata).toUpperCase();
      arrIata = arrIata || text(flight.arr_iata).toUpperCase();
    }
  }

  const [fromPlace, toPlace] = await Promise.all([
    airportPlace(mapsKey, rapidKey, depIata),
    airportPlace(mapsKey, rapidKey, arrIata),
  ]);

  const locationFrom = fromPlace?.name || text(draft.location_from);
  const locationTo = toPlace?.name || text(draft.location_to);
  const [fromTz, toTz] = await Promise.all([
    fromPlace?.tz || tzForText(mapsKey, locationFrom),
    toPlace?.tz || tzForText(mapsKey, locationTo),
  ]);

  // Same title the flight editor derives from a selected flight.
  const autoTitle = flightNumber
    ? `Flight ${flightNumber}${airline ? ` — ${airline}` : ''}`
    : '';

  return buildStandardItemPayload({
    type: 'flight',
    title: autoTitle || text(draft.title),
    start_datetime: wallTimeToUtcIso(draft.start_datetime, fromTz),
    end_datetime: wallTimeToUtcIso(draft.end_datetime, toTz),
    location_from: locationFrom,
    location_to: locationTo,
    from_place: fromPlace,
    to_place: toPlace,
    confirmation_number: flightNumber,
    booking_reference: draft.booking_reference,
    airline,
    notes: draft.notes,
  });
}

async function adaptPlaceItem(type: string, draft: any, mapsKey: string) {
  const resolved = await placeForText(mapsKey, draft.location_name);
  const tz = resolved.tz || (await tzForText(mapsKey, draft.location_name));
  return buildStandardItemPayload({
    type,
    title: text(draft.title),
    start_datetime: wallTimeToUtcIso(draft.start_datetime, tz),
    end_datetime: wallTimeToUtcIso(draft.end_datetime, tz),
    location_name: resolved.place?.name || text(draft.location_name),
    place: resolved.place,
    confirmation_number: draft.confirmation_number,
    booking_reference: draft.booking_reference,
    airline: draft.airline,
    notes: draft.notes,
  });
}

async function adaptRouteItem(type: string, draft: any, mapsKey: string) {
  // A car rental draft carries its pickup venue in location_name; the car
  // segment owns from → to, so the pickup becomes the origin.
  const locationFrom = text(draft.location_from) || (type === 'car' ? text(draft.location_name) : '');
  const locationTo = text(draft.location_to);
  const [fromTz, toTz] = await Promise.all([
    tzForText(mapsKey, locationFrom),
    tzForText(mapsKey, locationTo),
  ]);
  const venue = type === 'cruise'
    ? await placeForText(mapsKey, draft.location_name)
    : { place: null };
  return buildStandardItemPayload({
    type,
    title: text(draft.title),
    start_datetime: wallTimeToUtcIso(draft.start_datetime, type === 'cruise' && venue.place?.tz ? venue.place.tz : fromTz),
    end_datetime: wallTimeToUtcIso(draft.end_datetime, toTz),
    location_from: locationFrom,
    location_to: locationTo,
    location_name: draft.location_name,
    place: venue.place,
    confirmation_number: draft.confirmation_number,
    booking_reference: draft.booking_reference,
    airline: draft.airline,
    notes: draft.notes,
  });
}

// Adapt one classifier draft to the standard item payload.
export async function adaptReservationDraft(draft: any, fallbackTitle = ''): Promise<AdapterOutcome> {
  const source = draft && typeof draft === 'object' ? { ...draft } : {};
  if (!text(source.title) && text(fallbackTitle)) source.title = text(fallbackTitle);
  const type = normalizeItemType(source.type);
  const mapsKey = env('GOOGLEMAPS_TOGETTHERE');
  const rapidKey = env('RAPIDAPI_KEY');

  let payload: any;
  if (type === 'flight') payload = await adaptFlight(source, mapsKey, rapidKey);
  else if (type === 'car' || type === 'train' || type === 'cruise') payload = await adaptRouteItem(type, source, mapsKey);
  else payload = await adaptPlaceItem(type, source, mapsKey);

  const validation = validateStandardItem(payload);
  return {
    status: validation.ok ? 'ready' : 'incomplete',
    adapter: type,
    payload,
    missing: validation.missing,
  };
}