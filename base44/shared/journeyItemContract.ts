// The canonical journey-item contract: item types, the per-type field map, the
// standard payload builder and the minimum-data rules.
//
// It is the server-side mirror of the standard item form
// (src/components/journey/JourneyItemForm.jsx + src/lib/journeyItemSave.js):
//   - ITEM_TYPE_META === the form's TYPE_META (which fields a type owns)
//   - buildStandardItemPayload === buildJourneyPayload (same keys, same shape)
//   - validateStandardItem === the form's save-time requirements
//
// Everything that writes a JourneyItem — the form, the flight page and the
// inbox ingestion adapters — goes through this contract, so an imported item
// and a manually created one cannot drift apart.

export const JOURNEY_ITEM_TYPES = [
  'flight', 'car', 'train', 'hotel', 'activity', 'cruise', 'main_event', 'other',
] as const;

export type JourneyItemType = typeof JOURNEY_ITEM_TYPES[number];

// Which location fields each type owns. flight/car/train/cruise are routes
// (from → to); hotel/activity/main_event/other are single places. cruise owns
// both. Identical to the form's TYPE_META.
export const ITEM_TYPE_META: Record<string, { fromTo: boolean; place: boolean }> = {
  flight: { fromTo: true, place: false },
  car: { fromTo: true, place: false },
  train: { fromTo: true, place: false },
  cruise: { fromTo: true, place: true },
  hotel: { fromTo: false, place: true },
  activity: { fromTo: false, place: true },
  main_event: { fromTo: false, place: true },
  other: { fromTo: false, place: true },
};

export function normalizeItemType(value: unknown): JourneyItemType {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return (JOURNEY_ITEM_TYPES as readonly string[]).includes(text)
    ? (text as JourneyItemType)
    : 'other';
}

export function itemTypeMeta(type: unknown) {
  return ITEM_TYPE_META[normalizeItemType(type)] || ITEM_TYPE_META.other;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

// Only the documented place keys survive, so an imported item stores the same
// place shape the autocomplete selection produces.
const PLACE_KEYS = [
  'place_id', 'name', 'address', 'lat', 'lng', 'country', 'country_alpha3',
  'city', 'tz', 'iata',
];

export function sanitizePlace(place: any) {
  if (!place || typeof place !== 'object') return null;
  const out: any = {};
  for (const key of PLACE_KEYS) {
    const value = place[key];
    if (value === undefined || value === null || value === '') continue;
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

export type StandardItemFields = {
  type: unknown;
  title?: unknown;
  start_datetime?: unknown;   // UTC ISO instant
  end_datetime?: unknown;     // UTC ISO instant
  location_from?: unknown;
  location_to?: unknown;
  location_name?: unknown;
  from_place?: any;
  to_place?: any;
  place?: any;
  confirmation_number?: unknown;
  booking_reference?: unknown;
  airline?: unknown;
  notes?: unknown;
  attachments?: unknown;
};

// Mirrors buildJourneyPayload in src/lib/journeyItemSave.js: only the fields the
// type owns are emitted, empty strings stay empty strings (as the form sends
// them), and the *_place objects are emitted as null when unknown.
export function buildStandardItemPayload(fields: StandardItemFields) {
  const type = normalizeItemType(fields?.type);
  const meta = itemTypeMeta(type);
  const start = text(fields?.start_datetime);
  const end = text(fields?.end_datetime);
  return {
    type,
    title: text(fields?.title),
    start_datetime: start || undefined,
    end_datetime: end || undefined,
    location_from: meta.fromTo ? text(fields?.location_from) : undefined,
    location_to: meta.fromTo ? text(fields?.location_to) : undefined,
    location_name: meta.place ? text(fields?.location_name) : undefined,
    ...(meta.fromTo
      ? { from_place: sanitizePlace(fields?.from_place), to_place: sanitizePlace(fields?.to_place) }
      : {}),
    ...(meta.place ? { place: sanitizePlace(fields?.place) } : {}),
    confirmation_number: text(fields?.confirmation_number),
    booking_reference: text(fields?.booking_reference),
    airline: text(fields?.airline),
    notes: text(fields?.notes),
    attachments: Array.isArray(fields?.attachments) ? fields.attachments : [],
  };
}

// Minimum data for a save, exactly as the form enforces it:
//   every type      -> a title
//   flight (search) -> flight number + both resolved airports + departure
//   flight (manual) -> title + departure + origin text + destination text
export function validateStandardItem(payload: any): { ok: boolean; missing: string[] } {
  const p = payload || {};
  const type = normalizeItemType(p.type);
  const missing: string[] = [];

  if (!text(p.title)) missing.push('title');
  if (type !== 'flight') return { ok: missing.length === 0, missing };

  const hasNumber = !!text(p.confirmation_number);
  const hasAirports = !!p.from_place && !!p.to_place;
  const hasDeparture = !!text(p.start_datetime);
  const hasRouteText = !!text(p.location_from) && !!text(p.location_to);

  if (!hasNumber) missing.push('flight_number');
  if (!hasDeparture) missing.push('start_datetime');
  if (!hasAirports && !hasRouteText) {
    if (!text(p.location_from)) missing.push('flight_origin');
    if (!text(p.location_to)) missing.push('flight_destination');
  }
  return { ok: missing.length === 0, missing };
}