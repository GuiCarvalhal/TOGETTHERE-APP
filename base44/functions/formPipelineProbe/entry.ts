import { buildStandardItemPayload, validateStandardItem, ITEM_TYPE_META } from '../../shared/journeyItemContract.ts';
import { wallTimeToUtcIso } from '../../shared/wallClock.ts';

export default async function (req: Request) {
  const checks: any[] = [];
  const check = (name: string, pass: any, detail?: any) => checks.push({ name, pass: !!pass, detail: detail ?? null });
  const keys = (obj: any) => Object.keys(obj || {}).sort();

  const route = buildStandardItemPayload({ type: 'train', title: 'T', location_from: 'A', location_to: 'B', location_name: 'ignored' });
  check('train owns from/to, not place', 'location_from' in route && 'from_place' in route && !('place' in route) && !('location_name' in route), keys(route));
  const stay = buildStandardItemPayload({ type: 'hotel', title: 'H', location_name: 'Hotel', location_from: 'ignored' });
  check('hotel owns place, not from/to', 'place' in stay && 'location_name' in stay && !('location_from' in stay) && !('from_place' in stay), keys(stay));
  check('meta parity', ITEM_TYPE_META.car.fromTo === true && ITEM_TYPE_META.car.place === false);
  check('unknown type -> other', buildStandardItemPayload({ type: 'spaceship', title: 'x' }).type === 'other');
  check('wall->utc Rome', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome') === '2026-09-25T20:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'Europe/Rome'));
  check('wall->utc NY', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York') === '2026-09-26T02:40:00.000Z', wallTimeToUtcIso('2026-09-25T22:40', 'America/New_York'));
  check('title required', validateStandardItem({ type: 'hotel', title: '' }).missing.includes('title'));
  check('manual flight ok', validateStandardItem({ type: 'flight', title: 'F', start_datetime: 'x', confirmation_number: 'BA208', location_from: 'LHR', location_to: 'MIA' }).ok);

  return Response.json({ ok: checks.every((c) => c.pass), failed: checks.filter((c) => !c.pass), checks });
}