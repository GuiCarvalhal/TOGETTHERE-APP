import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { secrets } from 'base44:runtime';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { searchText, formatPlace, geocode, dedupePlaces } from '../../shared/googlePlaces.ts';

// TOGETTHERE AI concierge. Returns a route + date aware travel brief:
// group vibe, real nearby places (Google Places) to eat/do, today's picks
// (during the trip), suggested prep tasks, and good-to-know info (currency
// with a live conversion rate, weather, timezone, language, plug).
//
// Phase logic (the most important part):
//   - today < start  -> "before": suggestions span the ENTIRE route/corridor.
//   - start <= today <= end -> "during": only today onward + a "Today's picks"
//     section tuned to today's specific journey items and gaps.
//   - today > end -> "ended": no generation, no API calls.
// All place searches are bounded to a radius around the relevant leg(s).

function legLocation(item) {
  if (!item) return '';
  if (['flight', 'car', 'train', 'cruise'].includes(item.type)) {
    return item.location_to || item.location_name || item.location_from || '';
  }
  return item.location_name || item.location_to || item.location_from || '';
}

// Normalize a leg location for place searches: take the destination end of a
// "from → to" string, and expand IATA-like airport codes (e.g. "NAP") to the
// gathering's primary destination so geocoding lands in the right region
// ("NAP" -> Amalfi, not Napa, CA).
function cleanSearchLocation(loc, gathering) {
  let l = (loc || '').trim();
  const parts = l.split('→');
  if (parts.length > 1) l = parts[parts.length - 1].trim();
  if (/^[A-Z]{2,3}$/.test(l)) {
    const dests = (gathering?.destinations || []).filter(Boolean);
    if (dests.length) return dests[0];
  }
  return l;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    // Optional `today` override (YYYY-MM-DD) for testing the phase logic.
    const today = (body.today || new Date().toISOString().slice(0, 10)).slice(0, 10);

    const me = await getMyMember(base44, gatheringId, user.id);
    if (!me) return Response.json({ error: 'Not a member of this gathering' }, { status: 403 });

    const [gathering, members, items] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId }),
    ]);

    const start = gathering?.start_date || null;
    const end = gathering?.end_date || null;

    // ---- Phase ----
    let phase = 'during';
    if (!start && !end) phase = 'before';
    else if (start && today < start) phase = 'before';
    else if (end && today > end) phase = 'after';

    if (phase === 'after') {
      return Response.json({ phase: 'ended', today, generatedAt: new Date().toISOString() });
    }

    // ---- Ordered legs from the journey ----
    const sorted = (items || []).filter((i) => i.start_datetime).sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
    const allLegs = [];
    const seen = new Set();
    for (const it of sorted) {
      const loc = legLocation(it);
      if (!loc) continue;
      const key = loc.toLowerCase();
      if (!seen.has(key)) { seen.add(key); allLegs.push({ location: loc, date: it.start_datetime.slice(0, 10) }); }
    }
    if (!allLegs.length && (gathering?.destinations || []).length) {
      (gathering.destinations || []).forEach((d) => allLegs.push({ location: d, date: start || '' }));
    }
    let legs = allLegs;
    if (phase === 'during') {
      legs = allLegs.filter((l) => l.date >= today);
      if (!legs.length) legs = allLegs;
    }
    const searchLegs = legs.slice(0, 4);

    const todayItems = phase === 'during' ? sorted.filter((i) => i.start_datetime.slice(0, 10) === today) : [];
    const todayLocation = todayItems.length
      ? (legLocation(todayItems[todayItems.length - 1]) || legLocation(todayItems[0]) || '')
      : (legs[0]?.location || '');

    // ---- Context for Gemini ----
    const participants = (members || []).filter((m) => m.role !== 'viewer');
    // No eligible (non-viewer) participants: do NOT call the AI on viewer data.
    // Return a neutral message so the UI can ask an eligible member to add/join.
    if (!participants.length) {
      return Response.json({
        phase: 'no_participants',
        today,
        generatedAt: new Date().toISOString(),
        message: 'No participants to tailor advice for yet. Ask an organizer or member to add people to the gathering.',
      });
    }
    const profiles = participants.map((m) => {
      const hc = m.user_id === user.id ? (user.home_city || m.home_city) : m.home_city;
      const ints = m.user_id === user.id ? (user.interests || m.interests) : m.interests;
      return `${m.full_name || 'A member'} — home city: ${hc || 'unknown'}; dietary: ${(m.dietary_preferences || []).join(', ') || 'none'}; interests: ${(ints || []).join(', ') || 'general'}; budget: ${m.budget_level || 'moderate'}`;
    });
    const journeyText = sorted.length
      ? sorted.map((j) => `- ${j.type}: ${j.title}${j.start_datetime ? ' @ ' + j.start_datetime : ''}${legLocation(j) ? ' (' + legLocation(j) + ')' : ''}`).join('\n')
      : 'No segments added yet — base suggestions on the destinations and dates.';
    const destList = (gathering?.destinations || []).filter(Boolean).join(', ') || allLegs.map((l) => l.location).join(', ') || 'the destination';
    const dateRange = [start, end].filter(Boolean).join(' to ') || 'the trip dates';
    const phaseWord = phase === 'before'
      ? 'BEFORE the trip starts (plan the whole route corridor)'
      : 'DURING the trip (only from today onward; never suggest anything before today)';

    const geminiKey = secrets.get('GEMINI_API_KEY');
    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
    const oxrKey = secrets.get('OPENEXCHANGERATES_APP_ID');

    // ---- Gemini synthesis (vibe, tasks, good-to-know) ----
    async function geminiCall() {
      if (!geminiKey) throw new Error('Gemini API key not configured');
      const prompt = `You are the TOGETTHERE AI travel concierge. Synthesize a travel brief for a group gathering.

GATHERING: "${gathering?.name || 'Group trip'}"
Destinations: ${destList}
Dates: ${dateRange}
Today: ${today} — phase: ${phaseWord}

GROUP MEMBERS (${participants.length}):
${profiles.map((p, i) => `${i + 1}. ${p}`).join('\n')}

JOURNEY (chronological segments):
${journeyText}

ORDERED LOCATIONS the group travels through: ${allLegs.map((l) => l.location).join(' → ') || destList}

Produce JSON with exactly these keys:
- "vibe": { "tags": [2-3 short badge labels capturing the trip style], "paragraph": a 2-4 sentence narrative synthesis of what kind of trip this is, grounded in the actual journey composition and member mix, "tip": one concrete actionable tip for the group }
- "tasks": 5-8 practical prep/checklist items relevant to these destinations and dates (documents, tickets, packing for the season, local customs, logistics). Each item: { "text": short imperative, "category": one of documents|tickets|packing|customs|logistics|other, "forMembers": [] or a list of specific member names if the task applies only to them (e.g. a visa for a specific nationality) }
- "goodToKnow": { "destinationCurrency": ISO 4217 code for the destination, "homeCurrency": ${user.home_currency ? '"' + user.home_currency + '"' : 'ISO 4217 code for the current user\'s home city (' + (user.home_city || me.home_city || 'unknown') + ')'}, "weather": expected weather/season for the travel dates in one short phrase, "timezone": { "name": destination timezone name, "offset": UTC offset string like "UTC+1", "dstNote": short DST note or empty string }, "language": local language, "plug": electrical plug type and voltage like "Type F, 230V 50Hz" }

Return only JSON matching the schema.`;
      const schema = {
        type: 'OBJECT',
        properties: {
          vibe: { type: 'OBJECT', properties: {
            tags: { type: 'ARRAY', items: { type: 'STRING' } },
            paragraph: { type: 'STRING' },
            tip: { type: 'STRING' },
          }, required: ['tags', 'paragraph', 'tip'] },
          tasks: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
            text: { type: 'STRING' },
            category: { type: 'STRING', enum: ['documents', 'tickets', 'packing', 'customs', 'logistics', 'other'] },
            forMembers: { type: 'ARRAY', items: { type: 'STRING' } },
          }, required: ['text', 'category'] } },
          goodToKnow: { type: 'OBJECT', properties: {
            destinationCurrency: { type: 'STRING' },
            homeCurrency: { type: 'STRING' },
            weather: { type: 'STRING' },
            timezone: { type: 'OBJECT', properties: { name: { type: 'STRING' }, offset: { type: 'STRING' }, dstNote: { type: 'STRING' } }, required: ['name', 'offset'] },
            language: { type: 'STRING' },
            plug: { type: 'STRING' },
          }, required: ['destinationCurrency', 'homeCurrency', 'weather', 'timezone', 'language', 'plug'] },
        },
        required: ['vibe', 'tasks', 'goodToKnow'],
      };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.7 },
        }),
      });
      if (!res.ok) throw new Error('Gemini request failed (' + res.status + ')');
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return JSON.parse(text);
    }

    // ---- Real nearby places (Google Places, bounded radius) ----
    async function placesCall() {
      if (!mapsKey) return { whereToEat: [], whatToDo: [], todaysPicks: [] };
      try {
        const rawLocs = searchLegs.map((l) => l.location);
        if (phase === 'during' && todayLocation) rawLocs.push(todayLocation);
        const cleaned = rawLocs.map((l) => cleanSearchLocation(l, gathering));
        const locs = [];
        const seen = new Set();
        cleaned.forEach((l) => { const k = (l || '').toLowerCase(); if (l && !seen.has(k)) { seen.add(k); locs.push(l); } });
        const coords = await Promise.all(locs.map((l) => geocode(mapsKey, l)));
        const coordMap = {};
        locs.forEach((l, i) => { coordMap[l] = coords[i]; });
        const fields = 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri';
        async function searchNear(loc, query, radius) {
          const c = coordMap[loc];
          const bias = c ? { circle: { center: { latitude: c.lat, longitude: c.lng }, radius } } : null;
          const places = await searchText(mapsKey, `${query} in ${loc}`, bias, fields);
          return places.map(formatPlace);
        }
        const eatP = locs.map((l) => searchNear(l, 'restaurants', 5000));
        const doP = locs.map((l) => searchNear(l, 'attractions and things to do', 25000));
        const todayLoc = phase === 'during' ? cleanSearchLocation(todayLocation, gathering) : null;
        const todayP = todayLoc ? searchNear(todayLoc, 'things to do highlights', 25000) : Promise.resolve([]);
        const [eatLists, doLists, todaysPicks] = await Promise.all([Promise.all(eatP), Promise.all(doP), todayP]);
        return {
          whereToEat: dedupePlaces(eatLists, 10),
          whatToDo: dedupePlaces(doLists, 10),
          todaysPicks: (todaysPicks || []).slice(0, 4),
        };
      } catch {
        return { whereToEat: [], whatToDo: [], todaysPicks: [] };
      }
    }

    // ---- Live exchange rates (OpenExchangeRates, USD base) ----
    async function ratesCall() {
      if (!oxrKey) return null;
      try {
        const r = await fetch(`https://openexchangerates.org/api/latest.json?app_id=${oxrKey}&base=USD`);
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    }

    const [parsed, places, ratesData] = await Promise.all([geminiCall(), placesCall(), ratesCall()]);

    const vibe = parsed.vibe || { tags: [], paragraph: '', tip: '' };
    const aiTasks = parsed.tasks || [];
    const goodToKnow = parsed.goodToKnow || {};
    if (user.home_currency) goodToKnow.homeCurrency = user.home_currency;

    let rate = null;
    if (ratesData && ratesData.rates) {
      const home = (goodToKnow.homeCurrency || 'USD').toUpperCase();
      const dest = (goodToKnow.destinationCurrency || 'USD').toUpperCase();
      const hR = ratesData.rates[home];
      const dR = ratesData.rates[dest];
      if (hR && dR && home !== dest) {
        rate = {
          homeCurrency: home, destCurrency: dest,
          homeToDest: dR / hR, destToHome: hR / dR,
          asOf: ratesData.timestamp ? new Date(ratesData.timestamp * 1000).toISOString() : new Date().toISOString(),
        };
      }
    }

    return Response.json({
      phase, today, generatedAt: new Date().toISOString(),
      vibe, todaysPicks: places.todaysPicks, whereToEat: places.whereToEat, whatToDo: places.whatToDo,
      tasks: aiTasks, goodToKnow, rate,
      legs: searchLegs.map((l) => l.location),
      todayItems: todayItems.map((i) => ({ title: i.title, type: i.type, time: i.start_datetime, location: legLocation(i) })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}