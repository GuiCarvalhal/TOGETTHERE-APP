import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { resolveMyMembers } from '../../shared/gatheringAcl.ts';
import { resolveLiveFlight } from '../../shared/flightStatus.ts';
import { fetchDrivingRoute } from '../../shared/googleDirections.ts';
import { fetchWeatherAt } from '../../shared/openMeteo.ts';
import { loungeForAirline } from '../../shared/airlineLounges.ts';

// Live inputs for Home's "Next / Now" brief on ONE journey item: flight status
// (on time / delayed / cancelled, gate, terminal, feed timestamp), the real
// driving distance + traffic ETA to that item's airport or venue, weather at the
// hour the traveller actually gets there, and the airline's own lounge.
//
// Origin resolution, in order:
//   1. the latest segment that ended before this one and leaves the traveller
//      somewhere (a flight or train at its arrival airport, a stay at its
//      venue) — once the trip has started the route is measured from where the
//      traveller actually is, never from home;
//   2. else the user's HOME from their profile;
//   3. else the segment's own origin (reported as such, so the UI can say it);
//   4. else nothing — the caller then asks for a home city instead of guessing
//      from device location.
// Every external source is independent: one failing source degrades to the
// deterministic item data, never to an error or a blank card.

const TRANSFER_TYPES = ['car', 'train', 'cruise'];

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function pointOf(place) {
  if (!place || num(place.lat) === null || num(place.lng) === null) return null;
  return { lat: place.lat, lng: place.lng };
}

function coordString(place) {
  const p = pointOf(place);
  return p ? `${p.lat},${p.lng}` : '';
}

// Where a segment leaves you (or where it happens): arrival side first.
function settlePlace(item) {
  return item.to_place || item.place || item.from_place || null;
}

function placeLabel(place) {
  if (!place) return '';
  return text(place.city) || text(place.name) || text(place.address);
}

// Is the traveller on this segment? The segment's creator always is; a segment
// with no attendee list is a shared stay/activity that belongs to the whole
// trip; a segment that lists attendees must actually name this user, so another
// member's separate flight never becomes the origin of this route.
function includesTraveller(item, user) {
  const myKeys = new Set([user?.id, user?.email].filter(Boolean).map((v) => String(v).toLowerCase()));
  const ownerKey = String(item?.owner_id || '').trim().toLowerCase();
  if (ownerKey && myKeys.has(ownerKey)) return true;
  const attendees = (Array.isArray(item?.attendee_user_ids) ? item.attendee_user_ids : [])
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
  if (!attendees.length) return true;
  return attendees.some((v) => myKeys.has(v));
}

// Calendar date of an instant in the airport's own timezone (the flight feed is
// queried by departure date, which must be the AIRPORT's date, not UTC's).
function localDate(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

// The provider files a flight under the UTC calendar date of its departure (the
// AA1684 leaving at 23:53 local is filed under the next UTC day), which is also
// the date the item detail's status card queries. The airport-local date stays
// as a fallback, so a provider that files by local day still resolves.
function flightDates(item, originTz) {
  const utc = text(item.start_datetime).slice(0, 10);
  const local = localDate(item.start_datetime, originTz);
  return [...new Set([utc, local].filter(Boolean))];
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const gatheringId = text(body.gathering_id);
    const itemId = text(body.item_id);
    if (!gatheringId || !itemId) {
      return Response.json({ error: 'gathering_id and item_id are required' }, { status: 400 });
    }

    const { members } = await resolveMyMembers(base44, user);
    if (!(members || []).some((m) => m.gathering_id === gatheringId)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const item = await base44.asServiceRole.entities.JourneyItem.get(itemId)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!item || item.gathering_id !== gatheringId || item.is_deleted === true) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const siblings = await base44.asServiceRole.entities.JourneyItem
      .filter({ gathering_id: gatheringId }).catch(() => []);
    const startMs = item.start_datetime ? new Date(item.start_datetime).getTime() : Date.now();

    // Where the traveller was just before this segment: the LATEST earlier item
    // that leaves them somewhere — a flight/train/cruise at its arrival point, a
    // stay at its venue. Any type counts, because after the first leg home is no
    // longer where they are.
    const priorStay = (siblings || [])
      .filter((s) => s.id !== item.id && s.is_deleted !== true)
      .filter((s) => includesTraveller(s, user))
      .filter((s) => {
        const end = s.end_datetime || s.start_datetime;
        const place = settlePlace(s);
        if (!end || new Date(end).getTime() > startMs || !place) return false;
        return !!coordString(place) || !!text(place.address) || !!text(place.name);
      })
      .sort((a, b) => new Date(b.end_datetime || b.start_datetime) - new Date(a.end_datetime || a.start_datetime))[0] || null;

    const family = item.type === 'flight'
      ? 'flight'
      : (TRANSFER_TYPES.includes(item.type) ? 'transfer' : 'stay');

    // What we route TO: the departure airport for a flight, the venue for a
    // stay/activity, the arrival point for a ride/train/cruise.
    const targetPlace = family === 'flight'
      ? (item.from_place || null)
      : family === 'transfer' ? (item.to_place || null) : (item.place || item.to_place || null);

    const priorPlace = priorStay ? settlePlace(priorStay) : null;
    const homePlace = pointOf(user.home_place) ? user.home_place : null;
    const homeLabel = text(user.home_city) || text(user.home_place?.address);

    let originSource = 'none';
    let originAddress = '';
    let originLabel = '';
    let originTz = '';
    // The place the origin actually describes, so the caller can report the
    // same point the route was measured from.
    let originPlace = null;

    const itemOriginAddress = coordString(item.from_place) || text(item.from_place?.address) || text(item.location_from);
    const itemOriginLabel = placeLabel(item.from_place) || text(item.location_from);

    if (family === 'transfer' && itemOriginAddress) {
      // A ride/train/cruise starts where the segment starts; that IS the origin.
      originPlace = item.from_place || null;
      originAddress = itemOriginAddress;
      originSource = 'item_origin';
      originLabel = itemOriginLabel;
      originTz = text(item.from_place?.tz);
    } else if (priorPlace) {
      originPlace = priorPlace;
      originAddress = coordString(priorPlace) || text(priorPlace.address);
      originSource = 'prior';
      // The venue the traveller is coming from (hotel, airport, station), not
      // just its city: that is what makes the origin worth printing. Long
      // airport names are shortened back to their city so the tip stays short.
      const venue = text(priorPlace.name);
      originLabel = venue && venue.length <= 40 ? venue : placeLabel(priorPlace);
      originTz = text(priorPlace.tz);
    } else if (homePlace || homeLabel) {
      originPlace = homePlace;
      originAddress = coordString(homePlace) || homeLabel;
      originSource = 'home';
      originLabel = homeLabel || placeLabel(homePlace);
      originTz = text(homePlace?.tz);
    } else if (itemOriginAddress) {
      originPlace = item.from_place || null;
      originAddress = itemOriginAddress;
      originSource = 'item_origin';
      originLabel = itemOriginLabel;
      originTz = text(item.from_place?.tz);
    }
    if (!originTz) originTz = text(item.from_place?.tz) || text(item.place?.tz) || '';

    const destinationAddress = coordString(targetPlace)
      || text(targetPlace?.address) || text(item.location_to) || text(item.location_name);

    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
    const rapidKey = secrets.get('RAPIDAPI_KEY');

    // Weather belongs to the hour the traveller is actually THERE: arrival for a
    // flight, start time for a venue.
    const weatherPoint = pointOf(family === 'transfer' ? (item.to_place || null) : targetPlace);
    const weatherInstant = family === 'flight'
      ? (item.end_datetime || item.start_datetime || '')
      : (item.start_datetime || item.end_datetime || '');
    // A segment sometimes carries the airline's booking code (a PNR such as
    // "LLMJYV") or keeps the number only in its title, so try every plausible
    // designator before giving up on live status — the gate is the single most
    // useful line on this card.
    const DESIGNATOR = /^[A-Z0-9]{2}\d{1,4}$/i;
    const designator = (v) => {
      const s = text(v).replace(/\s+/g, '');
      return DESIGNATOR.test(s) ? s : '';
    };
    const titleMatch = (text(item.title).match(/^(?:flight\s+)?([A-Z0-9]{2}\s?\d{1,4})(?:\b|$)/i) || [])[1];
    const flightCodes = [...new Set([
      designator(item.confirmation_number),
      designator(item.booking_reference),
      designator(titleMatch),
    ].filter(Boolean))].slice(0, 2);
    const wantsRoute = !!(mapsKey && originAddress && destinationAddress);
    const wantsFlight = family === 'flight' && !!rapidKey && flightCodes.length > 0;

    const [routeRes, flightRes, weatherRes] = await Promise.allSettled([
      wantsRoute ? fetchDrivingRoute(mapsKey, originAddress, destinationAddress) : Promise.resolve(null),
      wantsFlight
        // Same cache the flight item's own status card reads: one provider call
        // per refresh window, shared by both screens.
        ? resolveLiveFlight(base44, {
            rapidKey,
            codes: flightCodes,
            dates: flightDates(item, originTz),
            departureAt: item.start_datetime,
          })
        : Promise.resolve(null),
      weatherPoint && weatherInstant
        ? fetchWeatherAt(weatherPoint.lat, weatherPoint.lng, weatherInstant)
        : Promise.resolve(null),
    ]);

    const route = routeRes.status === 'fulfilled' ? routeRes.value : null;
    const flight = flightRes.status === 'fulfilled' ? flightRes.value : null;
    const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;

    const routeOk = !!(route && route.ok);
    const liveFlight = flight?.flight || null;
    const terminal = text(liveFlight?.departure?.terminal);
    const lounge = family === 'flight'
      ? loungeForAirline(text(item.airline) || text(liveFlight?.airline), terminal)
      : null;

    return Response.json({
      family,
      origin: {
        source: originSource,
        label: originLabel,
        tz: originTz,
        point: pointOf(originPlace) || pointOf(item.from_place) || null,
      },
      destination: {
        label: placeLabel(targetPlace) || text(item.location_to) || text(item.location_name),
        iata: text(item.from_place?.iata) || text(targetPlace?.iata),
        tz: text(targetPlace?.tz) || text(item.to_place?.tz) || '',
        point: pointOf(targetPlace),
      },
      route: routeOk ? {
        distance: route.distance || '',
        distanceMeters: num(route.distanceMeters),
        duration: route.duration || '',
        durationSeconds: num(route.durationSeconds),
        durationInTraffic: route.durationInTraffic || '',
        durationInTrafficSeconds: num(route.durationInTrafficSeconds),
      } : null,
      flight: liveFlight,
      weather,
      lounge: lounge ? { name: lounge.name, terminal: lounge.terminal } : null,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}