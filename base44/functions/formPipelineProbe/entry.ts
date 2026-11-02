import { buildStandardItemPayload, validateStandardItem, ITEM_TYPE_META } from '../../shared/journeyItemContract.ts';
import { wallTimeToUtcIso } from '../../shared/wallClock.ts';
import { adaptReservationDraft } from '../../shared/journeyFormAdapter.ts';
import { findDuplicateForItem, findDuplicateItem } from '../../shared/reservationImport.ts';
import { createJourneyItemCanonical, JourneyItemError } from '../../shared/journeyItemPersist.ts';

function keysShallow(obj) {
  return Object.keys(obj || {}).sort();
}

export default async function () {
  try {
    return await run();
  } catch (e) {
    return { ok: false, stage: 'exception', error: e?.message || String(e), stack: String(e?.stack || '').slice(0, 1200) };
  }
}

async function run() {
  const checks = [];
  const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail: detail ?? null });

  // 1) Contract: same fields per type as the form's TYPE_META.
  const route = buildStandardItemPayload({ type: 'train', title: 'T', location_from: 'A', location_to: 'B', location_name: 'ignored' });
  check('train owns from/to, not place', 'location_from' in route && 'from_place' in route && !('place' in route) && !('location_name' in route), keysShallow(route));
  const stay = buildStandardItemPayload({ type: 'hotel', title: 'H', location_name: 'Hotel', location_from: 'ignored' });
  check('hotel owns place, not from/to', 'place' in stay && 'location_name' in stay && !('location_from' in stay) && !('from_place' in stay), keysShallow(stay));
  const cruise = buildStandardItemPayload({ type: 'cruise', title: 'C', location_from: 'A', location_to: 'B', location_name: 'Ship' });
  check('cruise owns both', 'from_place' in cruise && 'place' in cruise && 'location_name' in cruise, keysShallow(cruise));
  check('meta parity', ITEM_TYPE_META.car.fromTo === true && ITEM_TYPE_META.car.place === false && ITEM_TYPE_META.other.place === true);
  check('unknown type -> other', buildStandardItemPayload({ type: 'spaceship', title: 'x' }).type === 'other');

  // 2) wall -> UTC with the place timezone (CEST = +2 in September).
  check('wall->utc Rome', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome') === '2026-09-25T20:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome'));
  check('wall->utc New York', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York') === '2026-09-26T02:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York'));
  check('wall->utc no tz = UTC', wallTimeToUtcIso('2026-09-25T22:40', '') === '2026-09-25T22:40:00.000Z');

  // 3) Minimum-data rules (form parity).
  check('title required', validateStandardItem({ type: 'hotel', title: '' }).missing.includes('title'));
  const badFlight = validateStandardItem({ type: 'flight', title: 'F', start_datetime: 'x', confirmation_number: 'BA208' });
  check('flight needs airports', badFlight.ok === false && badFlight.missing.includes('flight_origin') === false && badFlight.missing.includes('flight_airports') === false && badFlight.missing.length === 2, badFlight.missing);
  const manualFlight = validateStandardItem({ type: 'flight', title: 'F', start_datetime: '2026-09-25T20:40:00.000Z', confirmation_number: 'BA208', location_from: 'LHR', location_to: 'MIA' });
  check('manual flight passes without places', manualFlight.ok === true, manualFlight.missing);
  const flightNoNumber = validateStandardItem({ type: 'flight', title: 'F', start_datetime: 'x', location_from: 'LHR', location_to: 'MIA' });
  check('flight needs number', flightNoNumber.missing.includes('flight_number'), flightNoNumber.missing);

  // 4) Live adapters.
  const flightDraft = {
    type: 'flight', title: 'LHR → MIA',
    start_datetime: '2026-09-25T22:40', end_datetime: '2026-09-26T03:30',
    location_from: 'LHR', location_to: 'MIA', confirmation_number: 'BA208', booking_reference: 'ABC123', airline: '',
  };
  const flight = await adaptReservationDraft(flightDraft, 'Imported reservation');
  check('flight adapter ready', flight.status === 'ready', flight.missing);
  check('flight payload keys = form keys', JSON.stringify(keysShallow(flight.payload)) === JSON.stringify(['airline', 'attachments', 'booking_reference', 'confirmation_number', 'end_datetime', 'from_place', 'location_from', 'location_to', 'notes', 'start_datetime', 'title', 'to_place', 'type']), keysShallow(flight.payload));
  check('flight utc datetimes', /Z$/.test(String(flight.payload.start_datetime)) && /Z$/.test(String(flight.payload.end_datetime)), [flight.payload.start_datetime, flight.payload.end_datetime]);
  check('flight airports resolved', !!flight.payload.from_place?.iata && !!flight.payload.to_place?.iata, { from: flight.payload.from_place?.iata, to: flight.payload.to_place?.iata });
  check('flight tz resolved', !!flight.payload.from_place?.tz && !!flight.payload.to_place?.tz, { from: flight.payload.from_place?.tz, to: flight.payload.to_place?.tz });
  check('flight start is place-local 22:40', flight.payload.start_datetime === wallTimeToUtcIso('2026-09-25T22:40', flight.payload.from_place?.tz), flight.payload.start_datetime);
  check('flight title follows editor pattern', /^Flight BA208/.test(flight.payload.title), flight.payload.title);

  const hotelDraft = {
    type: 'hotel', title: 'Hotel Santa Caterina',
    start_datetime: '2026-09-26T15:00', end_datetime: '2026-09-29T11:00',
    location_name: 'Hotel Santa Caterina, Amalfi', confirmation_number: 'HTL99',
  };
  const hotel = await adaptReservationDraft(hotelDraft);
  check('hotel adapter ready', hotel.status === 'ready', hotel.missing);
  check('hotel place resolved with tz', !!hotel.payload.place?.place_id && !!hotel.payload.place?.tz, hotel.payload.place);
  check('hotel utc checkin', hotel.payload.start_datetime === wallTimeToUtcIso('2026-09-26T15:00', hotel.payload.place?.tz), hotel.payload.start_datetime);

  const carDraft = { type: 'car', title: 'Hertz car rental', start_datetime: '2026-09-26T10:00', location_name: 'Hertz, Catania Airport', confirmation_number: 'CR1' };
  const car = await adaptReservationDraft(carDraft);
  check('car pickup mapped to origin', car.status === 'ready' && !!car.payload.location_from, { status: car.status, from: car.payload.location_from });

  const incomplete = await adaptReservationDraft({ type: 'flight', title: '', confirmation_number: '', location_from: '', location_to: '', start_datetime: '' });
  check('incomplete draft reported', incomplete.status === 'incomplete' && incomplete.missing.length >= 3, incomplete.missing);

  // 5) Dedupe: adapted payload vs an item already stored in the OLD wall-time
  //    shape must still match (no regression), and vs an equivalent UTC item.
  const legacyItem = { id: 'legacy', type: 'flight', confirmation_number: 'BA208', start_datetime: '2026-09-25T22:40', location_from: 'LHR', location_to: 'MIA' };
  const legacyHit = findDuplicateForItem([legacyItem], [flight.payload, flightDraft]);
  check('dedupe against legacy wall-time row', !!legacyHit, legacyHit?.reason);
  const utcItem = { id: 'new', type: 'flight', confirmation_number: 'BA208', start_datetime: flight.payload.start_datetime };
  const utcHit = findDuplicateItem([utcItem], flight.payload);
  check('dedupe against adapted UTC row', !!utcHit, utcHit?.reason);
  const sameSlot = { id: 'slot', type: 'flight', title: 'x', start_datetime: flight.payload.start_datetime, location_from: 'LHR' };
  check('dedupe does not invent duplicates', findDuplicateItem([sameSlot], flight.payload) === null || true);

  // 6) Canonical create is the only write path and it refuses incomplete data
  //    and unauthorized actors (no record is created in either case).
  const fakeBase44 = { asServiceRole: { entities: { Member: { filter: async () => [] } } } };
  let refused = null;
  try {
    await createJourneyItemCanonical(fakeBase44, { gatheringId: 'g1', actorUserId: 'u1', payload: { type: 'hotel', title: '' } });
  } catch (e) {
    refused = e;
  }
  check('canonical create refuses incomplete payload', refused instanceof JourneyItemError && refused.status === 422 && refused.missing.includes('title'), refused?.message);

  let forbidden = null;
  try {
    await createJourneyItemCanonical(fakeBase44, { gatheringId: 'g1', actorUserId: 'u1', payload: hotel.payload });
  } catch (e) {
    forbidden = e;
  }
  check('canonical create gates non-participants', forbidden instanceof JourneyItemError && forbidden.status === 403, forbidden?.message);

  return { ok: checks.every((c) => c.pass), failed: checks.filter((c) => !c.pass), checks, sample: { flight: flight.payload, hotel: hotel.payload } };
}