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

export function normalizeDraft(raw: any, fallbackTitle = '') {
  const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
  const confirmation = typeof raw?.confirmation_number === 'string' ? raw.confirmation_number.trim() : '';
  const bookingReference = typeof raw?.booking_reference === 'string' ? raw.booking_reference.trim() : '';
  const airline = typeof raw?.airline === 'string' ? raw.airline.trim() : '';
  const notes = typeof raw?.notes === 'string' ? raw.notes.trim() : '';
  const locationFrom = typeof raw?.location_from === 'string' ? raw.location_from.trim() : '';
  const locationTo = typeof raw?.location_to === 'string' ? raw.location_to.trim() : '';
  const locationName = typeof raw?.location_name === 'string' ? raw.location_name.trim() : '';

  return {
    type: normalizeType(raw?.type),
    title: title || confirmation || bookingReference || fallbackTitle || 'Imported reservation',
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
    'Only include a field when it is clearly stated in the content; leave it empty when unknown. Never invent data.',
    'Datetimes must be "YYYY-MM-DDTHH:MM" in 24-hour local time as written in the content, with no timezone suffix. If only a date is known, use "YYYY-MM-DDT00:00".',
    'For a flight: type "flight", location_from = origin airport or city, location_to = destination airport or city, confirmation_number = the flight number (e.g. BA208), airline = operating airline.',
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
    'Datetimes must be "YYYY-MM-DDTHH:MM" in 24-hour local time as written in the content, with no timezone suffix. If only a date is known, use "YYYY-MM-DDT00:00".',
    'For a flight: type "flight", location_from = origin airport or city, location_to = destination airport or city, confirmation_number = the flight number (e.g. BA208), airline = operating airline.',
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