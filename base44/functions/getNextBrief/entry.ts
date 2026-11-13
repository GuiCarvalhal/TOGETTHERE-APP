import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { secrets } from 'base44:runtime';
import { resolveMyMembers } from '../../shared/gatheringAcl.ts';
import { fetchFlightLiveByNumber } from '../../shared/aeroDataBox.ts';
import { fetchDrivingRoute } from '../../shared/googleDirections.ts';
import { fetchWeatherAt } from '../../shared/openMeteo.ts';
import { loungeForAirline } from '../../shared/airlineLounges.ts';

// Live inputs for Home's "Next / Now" brief on ONE journey item: flight status
// (on time / delayed / cancelled, gate, terminal, feed timestamp), the real
// driving distance + traffic ETA to that item's airport or venue, weather at the
// hour the traveller actually gets there, and the airline's own lounge.
//
// Origin resolution, in order:
//   1. the latest stay-type segment that ended before this one (a transfer does
//      not leave you anywhere, so flights/rides are not origins);
//   2. else the user's HOME from their profile;
//   3. else the segment's own origin (reported as such, so the UI can say it);
//   4. else nothing — the caller then asks for a home city instead of guessing
//      from device location.
// Every external source is independent: one failing source degrades to the
// deterministic item data, never to an error or a blank card.

const STAY_TYPES = ['hotel', 'activity', 'main_event', 'other'];
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

    const priorStay = (siblings || [])
      .filter((s) => s.id !== item.id && s.is_deleted !== true && STAY_TYPES.includes(s.type))
      .filter((s) => {
        const end = s.end_datetime || s.start_datetime;
        return end && new Date(end).getTime() <= startMs && !!settlePlace(s);
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

    if (family === 'transfer') {
      // A ride/train/cruise starts where the segment starts; that IS the origin.
      originAddress = coordString(item.from_place) || text(item.from_place?.address) || text(item.location_from);
      originSource = 'item_origin';
      originLabel = placeLabel(item.from_place) || text(item.location_from);
      originTz = text(item.from_place?.tz);
    } else if (priorPlace) {
      originAddress = coordString(priorPlace) || text(priorPlace.address);
      originSource = 'prior';
      originLabel = placeLabel(priorPlace);
      originTz = text(priorPlace.tz);
    } else if (homePlace || homeLabel) {
      originAddress = coordString(homePlace) || homeLabel;
      originSource = 'home';
      originLabel = homeLabel || placeLabel(homePlace);
      originTz = text(homePlace?.tz);
    } else if (coordString(item.from_place) || text(item.location_from)) {
      originAddress = coordString(item.from_place) || text(item.location_from);
      originSource = 'item_origin';
      originLabel = placeLabel(item.from_place) || text(item.location_from);
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
    const flightCode = text(item.confirmation_number);
    const wantsRoute = !!(mapsKey && originAddress && destinationAddress);
    const wantsFlight = family === 'flight' && !!rapidKey && !!flightCode;

    const [routeRes, flightRes, weatherRes] = await Promise.allSettled([
      wantsRoute ? fetchDrivingRoute(mapsKey, originAddress, destinationAddress) : Promise.resolve(null),
      wantsFlight
        ? fetchFlightLiveByNumber(rapidKey, flightCode, localDate(item.start_datetime, originTz))
        : Promise.resolve(null),
      weatherPoint && weatherInstant
        ? fetchWeatherAt(weatherPoint.lat, weatherPoint.lng, weatherInstant)
        : Promise.resolve(null),
    ]);

    const route = routeRes.status === 'fulfilled' ? routeRes.value : null;
    const flight = flightRes.status === 'fulfilled' ? flightRes.value : null;
    const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;

    const routeOk = !!(route && route.ok);
    const liveFlight = flight || null;
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
        point: pointOf(priorPlace) || pointOf(homePlace) || pointOf(item.from_place) || null,
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