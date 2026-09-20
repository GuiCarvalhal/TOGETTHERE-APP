import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

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

    const participants = (members || []).filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'member');
    const profiles = participants.map((m) => ({
      name: m.full_name || 'A member',
      home_city: m.home_city || 'unknown',
      dietary: (m.dietary_preferences || []).join(', ') || 'no restrictions specified',
      interests: (m.interests || []).join(', ') || 'general sightseeing',
      budget: m.budget_level || 'moderate',
    }));

    const dietMap = {};
    participants.forEach((m) => {
      (m.dietary_preferences || []).forEach((d) => {
        const key = (d || '').toLowerCase().trim();
        if (!key) return;
        (dietMap[key] = dietMap[key] || []).push(m.full_name || 'A member');
      });
    });
    const combinedDietary = Object.keys(dietMap).length
      ? Object.entries(dietMap).map(([d, names]) => `${d} (${names.join(', ')})`).join('; ')
      : 'no specific restrictions mentioned';

    const journey = (journeyItems || []).map((j) => ({
      type: j.type, title: j.title, start: j.start_datetime, end: j.end_datetime,
      from: j.location_from, to: j.location_to, place: j.location_name,
    }));

    const destinations = (gathering?.destinations || []).filter(Boolean);
    const destList = destinations.join(', ') || 'the destination';
    const dateRange = [gathering?.start_date, gathering?.end_date].filter(Boolean).join(' to ') || 'the trip dates';

    // 1. Google Places — real restaurants & activities near each destination.
    const googleKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (!googleKey) return Response.json({ error: 'Google Maps key (GOOGLEMAPS_TOGETTHERE) not configured' }, { status: 500 });

    async function placesSearch(query, location) {
      const q = encodeURIComponent(`${query} in ${location}`);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${googleKey}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).slice(0, 8).map((p) => ({
        name: p.name,
        address: p.formatted_address,
        rating: p.rating,
        price_level: p.price_level,
        types: (p.types || []).slice(0, 4),
      }));
    }

    const placeTargets = destinations.length ? destinations.slice(0, 2) : [destList];
    const placePromises = [];
    placeTargets.forEach((d) => {
      placePromises.push(placesSearch('restaurants', d).then((r) => r.map((x) => ({ ...x, category_hint: 'restaurant' }))));
      placePromises.push(placesSearch('things to do attractions', d).then((r) => r.map((x) => ({ ...x, category_hint: 'activity' }))));
    });
    const placeSets = await Promise.all(placePromises);
    const places = placeSets.flat().slice(0, 30);

    const placesText = places.length
      ? places.map((p, i) => `${i + 1}. ${p.name} [${p.category_hint}] — ${p.address || ''}${p.rating ? ' · rating ' + p.rating : ''}${p.price_level != null ? ' · price ' + p.price_level : ''}`).join('\n')
      : 'No specific places returned by Google Maps; suggest realistic options matching the style.';

    // 2. Gemini — personalize the real places to the group.
    const geminiKey = secrets.get('GEMINI_API_KEY');
    if (!geminiKey) return Response.json({ error: 'Gemini API key (GEMINI_API_KEY) not configured' }, { status: 500 });

    const prompt = `You are the TOGETTHERE AI concierge, a warm, knowledgeable travel advisor for a group trip.

GATHERING: "${gathering?.name || 'Group trip'}"
Destinations: ${destList}
Dates: ${dateRange}

REAL PLACES (from Google Maps near the destinations — prefer these, you may reframe them):
${placesText}

GROUP MEMBERS (${participants.length}):
${profiles.map((p, i) => `${i + 1}. ${p.name} — home city: ${p.home_city}; dietary: ${p.dietary}; interests: ${p.interests}; budget: ${p.budget}`).join('\n')}

COMBINED DIETARY NEEDS (the group must accommodate ALL of these at shared meals — prioritize restaurants that can serve the full set, not just one):
${combinedDietary}

JOURNEY (chronological segments):
${journey.length ? journey.map((j) => `- ${j.type}: ${j.title}${j.start ? ' @ ' + j.start : ''}${j.place ? ' (' + j.place + ')' : ''}${j.from && j.to ? ' ' + j.from + ' → ' + j.to : ''}`).join('\n') : 'No segments added yet — base suggestions on the destinations and dates.'}

Using the REAL PLACES above, produce personalized recommendations for restaurants and activities near where the group will actually be on each day/location. Group them by day and location following the journey. For restaurants especially, prioritize places that can accommodate the FULL combined set of dietary restrictions. For each recommendation:
- "name": use the real place name from the list when possible.
- "matches": list the specific group members (by name) this pick suits, each with a short, specific reason (a dietary match, an interest match, or a budget fit).
- "why_sentence": ONE crisp, specific sentence tying the pick to concrete member needs — name names and their dietary/interest/budget fit.
- "why": 1-3 short supporting tags referencing concrete member needs and proximity.
Vary the picks across days.

Also provide "day_summaries": for each day you cover, one sentence giving the context for that day's picks.

Return JSON matching the schema. 6-10 recommendations total.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        summary: { type: 'STRING', description: 'A 1-2 sentence warm intro' },
        day_summaries: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              day: { type: 'STRING' },
              summary: { type: 'STRING', description: "One sentence: the context for this day's picks" },
            },
            required: ['day', 'summary'],
          },
        },
        recommendations: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              day: { type: 'STRING' },
              location: { type: 'STRING' },
              category: { type: 'STRING', enum: ['restaurant', 'activity', 'stay', 'cafe', 'experience'] },
              name: { type: 'STRING' },
              description: { type: 'STRING' },
              why_sentence: { type: 'STRING' },
              why: { type: 'ARRAY', items: { type: 'STRING' } },
              matches: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    member_name: { type: 'STRING' },
                    reason: { type: 'STRING' },
                  },
                  required: ['member_name', 'reason'],
                },
              },
              price_level: { type: 'STRING', enum: ['budget', 'moderate', 'premium'] },
            },
            required: ['day', 'location', 'category', 'name', 'description', 'why_sentence', 'why'],
          },
        },
      },
      required: ['summary', 'day_summaries', 'recommendations'],
    };

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
      }),
    });
    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return Response.json({ error: 'Gemini request failed: ' + errText.slice(0, 200) }, { status: 502 });
    }
    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return Response.json({ error: 'Gemini returned invalid JSON' }, { status: 502 }); }

    return Response.json({ summary: parsed.summary || '', recommendations: parsed.recommendations || [], day_summaries: parsed.day_summaries || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}