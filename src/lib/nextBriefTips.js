// Deterministic tips for Home's "Next / Now" AI Agent brief.
//
// Built ONLY from the journey item Home already receives from getHomePreviews
// (times, places, confirmation, coordinates) — no extra network call, no LLM
// round trip, so the base render never waits on anything external. Missing data
// degrades to a shorter but still actionable tip: every family always returns
// exactly 3 tips.
//
// The builder is pure and returns i18n KEYS (never English strings) so the
// component can translate them, keeping EN / PT-BR parity in the dictionaries.

export const FLIGHT = 'flight';
export const TRANSFER = 'transfer';
export const STAY = 'stay';

const TRANSFER_TYPES = ['car', 'train', 'cruise'];

export function briefFamily(type) {
  if (type === FLIGHT) return FLIGHT;
  if (TRANSFER_TYPES.includes(type)) return TRANSFER;
  // hotel, activity, main_event, other — anything that is "be somewhere"
  return STAY;
}

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

function placeLabel(place, fallback) {
  if (!place) return clean(fallback);
  return clean(place.city) || clean(place.name) || clean(fallback);
}

function hasCoords(point) {
  return !!point
    && typeof point.lat === 'number'
    && typeof point.lng === 'number'
    && isFinite(point.lat)
    && isFinite(point.lng);
}

// Straight-line distance in meters (null when either end has no coordinates).
// Cheap and synchronous — used only as an approximate "how far is this" hint.
export function haversineMeters(a, b) {
  if (!hasCoords(a) || !hasCoords(b)) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// opts.time           formatted local start time ("2:30 PM"), '' when unknown
// opts.distanceLabel  formatted approximate distance ("120 mi"), '' when unknown
export function nextBriefTips(item, { time = '', distanceLabel = '' } = {}) {
  if (!item) return [];
  const when = clean(time);
  const from = placeLabel(item.from_place, item.location_from);
  const to = placeLabel(item.to_place, item.location_to);
  const place = placeLabel(item.place, item.location_name);
  const code = clean(item.confirmation_number);

  if (briefFamily(item.type) === FLIGHT) {
    return [
      {
        id: 'gate',
        titleKey: 'home.brief.flightGateTitle',
        detailKey: code && when
          ? 'home.brief.flightGateDetail'
          : code ? 'home.brief.flightGateDetailNoTime' : 'home.brief.flightGateDetailGeneric',
        vars: { flight: code, time: when },
      },
      {
        id: 'airport',
        titleKey: 'home.brief.flightAirportTitle',
        detailKey: from ? 'home.brief.flightAirportDetail' : 'home.brief.flightAirportDetailNoPlace',
        vars: { origin: from },
      },
      {
        id: 'landing',
        titleKey: to ? 'home.brief.flightArrivalTitle' : 'home.brief.flightArrivalTitleNoCity',
        detailKey: 'home.brief.flightArrivalDetail',
        vars: { city: to },
      },
    ];
  }

  if (briefFamily(item.type) === TRANSFER) {
    return [
      {
        id: 'depart',
        titleKey: 'home.brief.transferDepartTitle',
        detailKey: from && when
          ? 'home.brief.transferDepartDetail'
          : from ? 'home.brief.transferDepartDetailNoTime'
            : when ? 'home.brief.transferDepartDetailNoPlace'
              : 'home.brief.transferDepartDetailGeneric',
        vars: { from, time: when },
      },
      {
        id: 'route',
        titleKey: 'home.brief.transferRouteTitle',
        detailKey: distanceLabel
          ? 'home.brief.transferRouteDetail'
          : 'home.brief.transferRouteDetailNoData',
        vars: { distance: distanceLabel },
      },
      {
        id: 'dropoff',
        titleKey: 'home.brief.transferArrivalTitle',
        detailKey: to ? 'home.brief.transferArrivalDetail' : 'home.brief.transferArrivalDetailGeneric',
        vars: { to },
      },
    ];
  }

  return [
    {
      id: 'timing',
      titleKey: 'home.brief.stayTimingTitle',
      detailKey: when && place
        ? 'home.brief.stayTimingDetail'
        : when ? 'home.brief.stayTimingDetailNoPlace'
          : place ? 'home.brief.stayTimingDetailNoTime'
            : 'home.brief.stayTimingDetailGeneric',
      vars: { time: when, place },
    },
    {
      id: 'nearby',
      titleKey: 'home.brief.stayNearbyTitle',
      detailKey: place ? 'home.brief.stayNearbyDetail' : 'home.brief.stayNearbyDetailNoPlace',
      vars: { place },
    },
    {
      id: 'prep',
      titleKey: 'home.brief.stayPrepTitle',
      detailKey: code ? 'home.brief.stayPrepDetail' : 'home.brief.stayPrepDetailNoCode',
      vars: { confirmation: code },
    },
  ];
}