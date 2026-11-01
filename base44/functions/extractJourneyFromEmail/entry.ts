import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Extracts ONE travel-segment draft from booking content provided by the user.
// Input can be email text or any other plain-text reservation content. Uses the
// built-in InvokeLLM (Core) with a JSON schema matching JourneyItem fields.
// Does NOT connect to inboxes/accounts, does NOT persist raw text, and does
// NOT create any record ??? it only returns a draft for user review. The caller
// page is what creates the segment via createJourneyItem after confirmation.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return Response.json({ error: 'Reservation content is required' }, { status: 400 });
    if (text.length > 20000) return Response.json({ error: 'Reservation content is too long' }, { status: 400 });

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

    const draft = await base44.asServiceRole.integrations.Core.InvokeLLM({
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
    return Response.json({ draft });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
