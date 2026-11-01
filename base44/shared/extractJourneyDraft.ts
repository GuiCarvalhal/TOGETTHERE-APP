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

