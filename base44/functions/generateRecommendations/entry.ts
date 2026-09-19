import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const [members, journeyItems, gathering] = await Promise.all([
      base44.entities.Member.filter({ gathering_id: gatheringId }),
      base44.entities.JourneyItem.filter({ gathering_id: gatheringId }),
      base44.entities.Gathering.get(gatheringId),
    ]);

    const participants = (members || []).filter((m) => m.role === 'owner' || m.role === 'member');
    const profiles = participants.map((m) => ({
      name: m.full_name || 'A member',
      home_city: m.home_city || 'unknown',
      dietary: (m.dietary_preferences || []).join(', ') || 'no restrictions specified',
      interests: (m.interests || []).join(', ') || 'general sightseeing',
      budget: m.budget_level || 'moderate',
    }));

    const journey = (journeyItems || []).map((j) => ({
      type: j.type,
      title: j.title,
      start: j.start_datetime,
      end: j.end_datetime,
      from: j.location_from,
      to: j.location_to,
      place: j.location_name,
    }));

    const destList = (gathering?.destinations || []).join(', ') || 'the destination';
    const dateRange = [gathering?.start_date, gathering?.end_date].filter(Boolean).join(' to ') || 'the trip dates';

    const prompt = `You are the TOGETTHERE AI concierge, a warm, knowledgeable travel advisor for a group trip.

GATHERING: "${gathering?.name || 'Group trip'}"
Destinations: ${destList}
Dates: ${dateRange}

GROUP MEMBERS (${participants.length}):
${profiles.map((p, i) => `${i + 1}. ${p.name} — home city: ${p.home_city}; dietary: ${p.dietary}; interests: ${p.interests}; budget: ${p.budget}`).join('\n')}

JOURNEY (chronological segments):
${journey.length ? journey.map((j) => `- ${j.type}: ${j.title}${j.start ? ' @ ' + j.start : ''}${j.place ? ' (' + j.place + ')' : ''}${j.from && j.to ? ' ' + j.from + ' → ' + j.to : ''}`).join('\n') : 'No segments added yet — base suggestions on the destinations and dates.'}

Produce personalized recommendations for restaurants and activities near where the group will actually be on each day/location. Group them by day and location following the journey. For each recommendation:
- "matches": list the specific group members (by name) this pick suits, each with a short, specific reason (a dietary match, an interest match, or a budget fit).
- "why_sentence": ONE crisp, specific sentence tying the pick to concrete member needs — name names and their dietary/interest/budget fit (e.g. "Maya is vegetarian and loves art — this gallery café nails both.").
- "why": 1-3 short supporting tags for why it was picked — reference concrete member needs and proximity to the group's stay/activity locations.
Prefer concrete, real places when you know them; otherwise suggest realistic options matching the style. Vary the picks across days so the group isn't repeating the same spot.

Return JSON matching the schema. 6-10 recommendations total.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true,
      model: 'gemini_3_8_flash',
      response_json_schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'A 1-2 sentence warm intro to the recommendations' },
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                day: { type: 'string', description: 'Day label e.g. "Day 1" or a date' },
                location: { type: 'string', description: 'The location/area this recommendation is near' },
                category: { type: 'string', enum: ['restaurant', 'activity', 'stay', 'cafe', 'experience'] },
                name: { type: 'string' },
                description: { type: 'string', description: '1-2 sentence description' },
                why_sentence: { type: 'string', description: 'One crisp sentence tying this pick to specific member needs, naming names' },
                why: { type: 'array', items: { type: 'string' }, description: 'Short reasons it was picked for this group' },
                matches: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      member_name: { type: 'string' },
                      reason: { type: 'string' },
                    },
                    required: ['member_name', 'reason'],
                  },
                  description: 'Which members this recommendation suits and why',
                },
                price_level: { type: 'string', enum: ['budget', 'moderate', 'premium'] },
              },
              required: ['day', 'location', 'category', 'name', 'description', 'why_sentence', 'why'],
            },
          },
        },
        required: ['summary', 'recommendations'],
      },
    });

    return Response.json({ summary: result.summary || '', recommendations: result.recommendations || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}