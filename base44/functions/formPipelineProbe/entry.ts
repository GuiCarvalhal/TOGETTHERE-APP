import {
  buildStandardItemPayload,
  validateStandardItem,
  ITEM_TYPE_META,
  JOURNEY_ITEM_TYPES,
} from '../../shared/journeyItemContract.ts';
import { createJourneyItemCanonical, JourneyItemError } from '../../shared/journeyItemPersist.ts';
import { wallTimeToUtcIso } from '../../shared/wallClock.ts';

// Verifies that the standard item form's contract is a single source of truth and
// that the canonical persist path enforces it before touching the database.
export default async function (req: Request) {
  const checks: any[] = [];
  const check = (name: string, pass: any, detail?: any) => checks.push({ name, pass: !!pass, detail: detail ?? null });
  const defined = (obj: any) => Object.keys(obj || {}).filter((k) => obj[k] !== undefined).sort();

  // 1) Route types own from/to, single-place types own place.
  const route = buildStandardItemPayload({ type: 'train', title: 'T', location_from: 'Roma Termini', location_to: 'Napoli', location_name: 'ignored', place: { name: 'x' } });
  check('train keeps from/to only', route.location_from === 'Roma Termini' && route.location_to === 'Napoli' && route.location_name === undefined && !('place' in route), defined(route));

  const stay = buildStandardItemPayload({ type: 'hotel', title: 'H', location_name: 'Hotel Santa Caterina', location_from: 'ignored', from_place: { name: 'x' }, place: { name: 'Hotel Santa Caterina', country_alpha3: 'ITA', junk: 'drop' } });
  check('hotel keeps place only', stay.location_name === 'Hotel Santa Caterina' && stay.location_from === undefined && !('from_place' in stay), defined(stay));
  check('place sanitized to documented keys', !!stay.place && stay.place.junk === undefined && stay.place.country_alpha3 === 'ITA', stay.place);

  check('meta parity', ITEM_TYPE_META.flight.fromTo && !ITEM_TYPE_META.flight.place && ITEM_TYPE_META.hotel.place && !ITEM_TYPE_META.hotel.fromTo);
  check('unknown type -> other', buildStandardItemPayload({ type: 'spaceship', title: 'x' }).type === 'other');
  check('all 8 types have meta', JOURNEY_ITEM_TYPES.every((t) => !!ITEM_TYPE_META[t]));

  // 2) Same minimum-data rules as the form.
  check('title required', validateStandardItem({ type: 'hotel', title: '' }).missing.includes('title'));
  check('manual flight ok', validateStandardItem({ type: 'flight', title: 'F', start_datetime: 'x', confirmation_number: 'BA208', location_from: 'LHR', location_to: 'MIA' }).ok);
  check('search flight needs airports', validateStandardItem({ type: 'flight', title: 'F', start_datetime: 'x', confirmation_number: 'BA208' }).missing.includes('flight_origin'));

  // 3) Canonical persist enforces the contract before any DB access
  //    (base44 is passed as null on purpose: a valid rejection proves the order).
  let rejected: any = null;
  try {
    await createJourneyItemCanonical(null, { gatheringId: 'g', actorUserId: 'u', payload: { type: 'hotel', title: '' } });
  } catch (e) {
    rejected = e as JourneyItemError;
  }
  check('canonical path rejects incomplete payload', rejected instanceof JourneyItemError && rejected.status === 422 && rejected.missing.includes('title'), rejected && { status: rejected.status, missing: rejected.missing });

  // 4) Wall-clock -> UTC (the conversion every import path relies on).
  check('wall->utc Rome', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome') === '2026-09-25T20:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome'));
  check('wall->utc New York', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York') === '2026-09-26T02:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York'));

  const failed = checks.filter((c) => !c.pass);
  return Response.json({ ok: failed.length === 0, total: checks.length, failed });
}