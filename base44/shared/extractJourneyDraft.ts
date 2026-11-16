const ALLOWED_TYPES = new Set(['flight', 'car', 'train', 'hotel', 'activity', 'cruise', 'main_event', 'other']);

function normalizeType(v: unknown) {
  if (typeof v !== 'string') return 'other';
  const s = v.trim().toLowerCase();
  return ALLOWED_TYPES.has(s) ? s : 'other';
}

function normalizeDateTime(v: unknown) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$/.test(s)) return s;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

// A flight number is a carrier designator plus 1-4 digits (AA1684, G31256,
// LA8113). A record locator / reservation code (LLMJYV, 2I6VPC) is NOT one, and
// must never reach confirmation_number: the flight API is searched with that
// value, and no carrier recognises a PNR as a flight. Pure digits are kept as
// they are — there the carrier is missing from the source, not the number.
const CARRIER_FLIGHT_NUMBER = /^[A-Z0-9]{2}\d{1,4}[A-Z]?$/;
const BARE_FLIGHT_DIGITS = /^\d{1,4}$/;

export function looksLikeFlightNumber(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : '';
  if (!code) return false;
  return BARE_FLIGHT_DIGITS.test(code) || CARRIER_FLIGHT_NUMBER.test(code);
}

// The reservation code belongs to the traveler's personal notes — the only
// place they read it — appended once, next to whatever else was extracted.
function withBookingReference(notes: string, code: string) {
  if (!code) return notes;
  if (notes.toUpperCase().includes(code.toUpperCase())) return notes;
  const line = `Booking reference: ${code}`;
  return notes ? `${notes}\n${line}` : line;
}

export function normalizeDraft(raw: any, fallbackTitle = '') {
  const type = normalizeType(raw?.type);
  let title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  let confirmation = typeof raw?.confirmation_number === 'string' ? raw.confirmation_number.trim() : '';
  let bookingReference = typeof raw?.booking_reference === 'string' ? raw.booking_reference.trim() : '';
  const airline = typeof raw?.airline === 'string' ? raw.airline.trim() : '';
  let notes = typeof raw?.notes === 'string' ? raw.notes.trim() : '';

  // Flights only: a reservation code typed into the flight-number field is
  // moved to the booking reference and into the personal notes.
  let movedCode = '';
  if (type === 'flight' && confirmation && !looksLikeFlightNumber(confirmation)) {
    movedCode = confirmation;
    if (!bookingReference) bookingReference = movedCode;
    confirmation = '';
    // A title built from the PNR ("Flight LLMJYV — American Airlines") would
    // keep the wrong code on the card, so it falls back to the message subject.
    if (title && title.toUpperCase().includes(movedCode.toUpperCase())) title = '';
  }
  if (type === 'flight' && bookingReference) notes = withBookingReference(notes, bookingReference);
  const locationFrom = typeof raw?.location_from === 'string' ? raw.location_from.trim() : '';
  const locationTo = typeof raw?.location_to === 'string' ? raw.location_to.trim() : '';
  const locationName = typeof raw?.location_name === 'string' ? raw.location_name.trim() : '';

  // A flight is never named after its reservation code: only non-flight items
  // fall back to the booking reference for their title.
  const titleFallback = type === 'flight' ? '' : bookingReference;
  return {
    type,
    title: title || confirmation || titleFallback || fallbackTitle || 'Imported reservation',
    start_datetime: normalizeDateTime(raw?.start_datetime),
    end_datetime: normalizeDateTime(raw?.end_datetime),
    location_from: locationFrom,
    location_to: locationTo,
    location_name: locationName,
    confirmation_number: confirmation,
    booking_reference: bookingReference,
    airline,
    notes,
  };
}

const SEGMENT_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['flight', 'car', 'train', 'hotel', 'activity', 'cruise', 'main_event', 'other', ''] },
    title: { type: 'string' },
    start_datetime: { type: 'string' },
    end_datetime: { type: 'string' },
    location_from: { type: 'string' },
    location_to: { type: 'string' },
    location_name: { type: 'string' },
    confirmation_number: { type: 'string' },
    booking_reference: { type: 'string' },
    airline: { type: 'string' },
    notes: { type: 'string' },
  },
};

// Splits ONE message into every separate travel segment it describes. A round
// trip is two flights, a package is a flight plus a hotel, a multi-city ticket is
// one segment per leg. Each segment becomes its own journey item, and every one
// of them carries the same source email as an attachment.
export async function extractJourneyDrafts(base44: any, content: string, fallbackTitle = '') {
  const prompt = [
    'You extract travel booking details from reservation content the user provided.',
    'Return EVERY separate travel segment described in the content, one entry per segment.',
    'Rules for splitting:',
    '- Each flight leg is its own segment (a round trip is 2 segments, a connection is 1 segment only if the content presents it as a single booking with one flight number per leg ??? otherwise one segment per flight number).',
    '- A hotel stay is its own segment, separate from the flights around it.',
    '- A car rental, train trip, cruise or ticketed activity/event is its own segment.',
    '- Never merge different bookings into one entry, and never repeat the same booking twice.',
    '- title: a short, specific name for the segment as a traveler would say it. Use the hotel\'s name for a stay, the flight number and airline for a flight, the venue or tour name for an activity. Never return a generic title like "Hotel Stay", "Flight" or "Imported reservation".',
    'Only include a field when it is clearly stated in the content; leave it empty when unknown. Never invent data.',
    'Datetimes must be "YYYY-MM-DDTHH:MM" in 24-hour local time as written in the content, with no timezone suffix. If only a date is known, use "YYYY-MM-DDT00:00".',
    'For a flight: type "flight", location_from = origin airport or city, location_to = destination airport or city, airline = operating airline.',
    'confirmation_number for a flight is ONLY the flight number: the 2-character airline code plus 1-4 digits (e.g. AA1684, G31256, LA8113). Never put a reservation code, record locator, PNR or booking code (6 mixed letters and digits such as LLMJYV or 2I6VPC) in confirmation_number, and never append a date, airport, seat or cabin to it. If the content shows only a reservation code and no flight number, leave confirmation_number empty.',
    'booking_reference = the reservation code / record locator / PNR exactly as printed (e.g. LLMJYV), whenever the content shows that code is a reservation reference rather than a flight number.',
    'notes: the booking details a traveler needs at the airport and nowhere else: repeat the reservation code as "Booking reference: X", plus ticket number, seat, cabin class, terminal, gate and passenger names when present. Never copy marketing or promotional wording into notes.',
    'For a hotel: type "hotel", location_name = hotel name, start_datetime = check-in, end_datetime = check-out.',
    'For a train: type "train". For a car rental or drive: type "car". For an activity, tour or event: type "activity".',
    'If the content holds a single booking, return a single entry.',
    'Return JSON only, matching the schema.',
    '',
    'CONTENT:',
    content,
  ].join('\n');

  const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        segments: { type: 'array', items: SEGMENT_SCHEMA },
      },
    },
  });

  const list = Array.isArray(raw?.segments) ? raw.segments : [];
  const drafts = list
    .map((entry: any) => normalizeDraft(entry, fallbackTitle))
    .filter((draft: any) => draft.title || draft.start_datetime || draft.location_name || draft.location_from);

  return drafts;
}

export async function extractJourneyDraft(base44: any, text: string, fallbackTitle = '') {
  const prompt = [
    'You extract travel booking details from reservation content the user provided.',
    'Extract ONE travel segment ??? the primary booking in the content.',
    'Only include a field when it is clearly stated in the content; leave it empty when unknown. Never invent data.',
    'title: a short, specific name for the segment as a traveler would say it. Use the hotel\'s name for a stay, the flight number and airline for a flight, the venue or tour name for an activity. Never return a generic title like "Hotel Stay", "Flight" or "Imported reservation".',
    'Datetimes must be "YYYY-MM-DDTHH:MM" in 24-hour local time as written in the content, with no timezone suffix. If only a date is known, use "YYYY-MM-DDT00:00".',
    'For a flight: type "flight", location_from = origin airport or city, location_to = destination airport or city, airline = operating airline.',
    'confirmation_number for a flight is ONLY the flight number: the 2-character airline code plus 1-4 digits (e.g. AA1684, G31256, LA8113). Never put a reservation code, record locator, PNR or booking code (6 mixed letters and digits such as LLMJYV or 2I6VPC) in confirmation_number, and never append a date, airport, seat or cabin to it. If the content shows only a reservation code and no flight number, leave confirmation_number empty.',
    'booking_reference = the reservation code / record locator / PNR exactly as printed (e.g. LLMJYV), whenever the content shows that code is a reservation reference rather than a flight number.',
    'notes: the booking details a traveler needs at the airport and nowhere else: repeat the reservation code as "Booking reference: X", plus ticket number, seat, cabin class, terminal, gate and passenger names when present. Never copy marketing or promotional wording into notes.',
    'For a hotel: type "hotel", location_name = hotel name, start_datetime = check-in, end_datetime = check-out.',
    'For a train: type "train". For a car rental or drive: type "car". For an activity, tour or event: type "activity".',
    'Return JSON only, matching the schema.',
    '',
    'CONTENT:',
    text,
  ].join('\n');

  const raw = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    response_json_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['flight', 'car', 'train', 'hotel', 'activity', 'cruise', 'main_event', 'other', ''] },
        title: { type: 'string' },
        start_datetime: { type: 'string' },
        end_datetime: { type: 'string' },
        location_from: { type: 'string' },
        location_to: { type: 'string' },
        location_name: { type: 'string' },
        confirmation_number: { type: 'string' },
        booking_reference: { type: 'string' },
        airline: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  });
  return normalizeDraft(raw, fallbackTitle);
}