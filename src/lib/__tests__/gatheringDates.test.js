import { describe, it, expect } from 'vitest';
import {
  itemInvolvesUser,
  rangeFromItems,
  deriveGatheringRange,
  deriveGatheringLocation,
  gatheringDateStatus,
  formatGatheringRange,
  mainEventOf,
  mainEventAddress,
  inclusiveDayCount,
  selectedItemsForRange,
  deriveGatheringMeta,
} from '../gatheringDates';

// ---- itemInvolvesUser ----

describe('itemInvolvesUser', () => {
  it('attendee membership counts for any type', () => {
    expect(itemInvolvesUser({ type: 'flight', attendee_user_ids: ['u1'] }, 'u1')).toBe(true);
    expect(itemInvolvesUser({ type: 'hotel', attendee_user_ids: ['u1'] }, 'u1')).toBe(true);
  });

  it('creator fallback for non-flight only', () => {
    expect(itemInvolvesUser({ type: 'hotel', owner_id: 'u1' }, 'u1')).toBe(true);
    expect(itemInvolvesUser({ type: 'activity', owner_id: 'u1' }, 'u1')).toBe(true);
  });

  it('flight without attendees does NOT inherit creator', () => {
    expect(itemInvolvesUser({ type: 'flight', owner_id: 'u1', attendee_user_ids: [] }, 'u1')).toBe(false);
  });

  it('never uses owner_user_id (gathering owner) or member_user_ids (ACL)', () => {
    expect(itemInvolvesUser({ type: 'hotel', owner_user_id: 'u1', member_user_ids: ['u1'] }, 'u1')).toBe(false);
    expect(itemInvolvesUser({ type: 'flight', owner_user_id: 'u1', member_user_ids: ['u1'] }, 'u1')).toBe(false);
  });

  it('returns false for null userId', () => {
    expect(itemInvolvesUser({ type: 'hotel', attendee_user_ids: ['u1'] }, null)).toBe(false);
  });
});

// ---- rangeFromItems ----

describe('rangeFromItems', () => {
  it('earliest start .. latest end', () => {
    const items = [
      { start_datetime: '2026-03-15T10:00:00Z', end_datetime: '2026-03-15T12:00:00Z' },
      { start_datetime: '2026-03-10T08:00:00Z', end_datetime: '2026-03-20T18:00:00Z' },
    ];
    const r = rangeFromItems(items);
    expect(r.start.toISOString()).toBe('2026-03-10T08:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-20T18:00:00.000Z');
  });

  it('end falls back to start', () => {
    const r = rangeFromItems([{ start_datetime: '2026-03-10T08:00:00Z' }]);
    expect(r.end.toISOString()).toBe(r.start.toISOString());
  });

  it('null when no item has a datetime', () => {
    expect(rangeFromItems([{ type: 'hotel' }])).toBeNull();
  });
});

// ---- deriveGatheringRange: Main Event priority ----

describe('deriveGatheringRange — Main Event prevails', () => {
  it('Main Event dates override all other items', () => {
    const items = [
      { type: 'flight', start_datetime: '2026-01-01T00:00:00Z', end_datetime: '2026-01-02T00:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'main_event', start_datetime: '2026-06-01T00:00:00Z', end_datetime: '2026-06-03T00:00:00Z' },
      { type: 'hotel', start_datetime: '2026-07-01T00:00:00Z', end_datetime: '2026-07-10T00:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    const r = deriveGatheringRange({}, items, 'u1', 'member');
    expect(r.start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-06-03T00:00:00.000Z');
  });

  it('Main Event prevails even for a viewer', () => {
    const items = [
      { type: 'main_event', start_datetime: '2026-06-01T00:00:00Z', end_datetime: '2026-06-03T00:00:00Z' },
    ];
    const r = deriveGatheringRange({}, items, 'v1', 'viewer');
    expect(r.hasRange).toBe(true);
    expect(r.start.toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });
});

// ---- deriveGatheringRange: Viewer fallback ----

describe('deriveGatheringRange — Viewer fallback', () => {
  it('viewer with own attendee items uses them first (participant-first)', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', end_datetime: '2026-03-02T00:00:00Z', owner_id: 'v1', attendee_user_ids: ['v1'] },
      { type: 'activity', start_datetime: '2026-04-01T00:00:00Z', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    // A viewer "v1" is an attendee on the hotel — participant-first applies to
    // viewers too, so only the hotel counts (March 1–2), not the activity.
    const r = deriveGatheringRange({}, items, 'v1', 'viewer');
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-02T00:00:00.000Z');
  });

  it('viewer with no own items falls back to all', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', owner_id: 'other', attendee_user_ids: ['other'] },
      { type: 'activity', start_datetime: '2026-04-01T00:00:00Z', owner_id: 'u2', attendee_user_ids: ['u2'] },
    ];
    const r = deriveGatheringRange({}, items, 'v1', 'viewer');
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
  });

  it('non-viewer with no own items falls back to all', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    const r = deriveGatheringRange({}, items, 'u1', 'member');
    expect(r.hasRange).toBe(true);
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });

  it('non-viewer with own items uses only their items', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'activity', start_datetime: '2026-09-01T00:00:00Z', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    const r = deriveGatheringRange({}, items, 'u1', 'member');
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

// ---- deriveGatheringRange: flight rule ----

describe('deriveGatheringRange — flight rule', () => {
  it('flight without attendees is not counted as the user\'s item', () => {
    const items = [
      { type: 'flight', start_datetime: '2026-01-01T00:00:00Z', owner_id: 'u1', attendee_user_ids: [] },
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    // The flight is owned by u1 but has no attendees — u1 is NOT involved in it.
    // So only the hotel counts; the range is March 1 only.
    const r = deriveGatheringRange({}, items, 'u1', 'member');
    expect(r.start.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-03-01T00:00:00.000Z');
  });
});

// ---- deriveGatheringLocation ----

describe('deriveGatheringLocation', () => {
  it('Main Event location prevails', () => {
    const items = [
      { type: 'hotel', place: { name: 'Hilton' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'main_event', place: { name: 'Central Park' } },
    ];
    const locs = deriveGatheringLocation(items, 'u1', 'member');
    expect(locs).toHaveLength(1);
    expect(locs[0].name).toBe('Central Park');
  });

  it('lodging + activities only; excludes flights and transport', () => {
    const items = [
      { type: 'flight', place: { name: 'JFK Airport' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'car', from_place: { name: 'Rome' }, to_place: { name: 'Naples' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'train', from_place: { name: 'Milan' }, to_place: { name: 'Florence' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'hotel', place: { name: 'Hilton Rome' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'activity', place: { name: 'Colosseum Tour' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    const locs = deriveGatheringLocation(items, 'u1', 'member');
    const names = locs.map((l) => l.name);
    expect(names).toContain('Hilton Rome');
    expect(names).toContain('Colosseum Tour');
    expect(names).not.toContain('JFK Airport');
    expect(names).not.toContain('Rome'); // car from_place
    expect(names).not.toContain('Milan'); // train from_place
  });

  it('viewer gets all lodging + activities (not just own)', () => {
    const items = [
      { type: 'hotel', place: { name: 'Hilton' }, owner_id: 'other', attendee_user_ids: ['other'] },
      { type: 'activity', place: { name: 'Tour' }, owner_id: 'u2', attendee_user_ids: ['u2'] },
    ];
    const locs = deriveGatheringLocation(items, 'v1', 'viewer');
    expect(locs.map((l) => l.name)).toEqual(expect.arrayContaining(['Hilton', 'Tour']));
  });

  it('deduplicates by place name', () => {
    const items = [
      { type: 'hotel', place: { name: 'Hilton' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'activity', place: { name: 'Hilton' }, owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    const locs = deriveGatheringLocation(items, 'u1', 'member');
    expect(locs).toHaveLength(1);
  });

  it('falls back to location_name when place is absent', () => {
    const items = [
      { type: 'activity', location_name: 'Beach Club', owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    const locs = deriveGatheringLocation(items, 'u1', 'member');
    expect(locs).toHaveLength(1);
    expect(locs[0].name).toBe('Beach Club');
  });

  it('empty when no location-bearing items', () => {
    expect(deriveGatheringLocation([{ type: 'flight', owner_id: 'u1', attendee_user_ids: ['u1'] }], 'u1', 'member')).toEqual([]);
  });
});

// ---- gatheringDateStatus + formatGatheringRange with role ----

describe('gatheringDateStatus and formatGatheringRange accept role', () => {
  const items = [{ type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', end_datetime: '2026-03-05T00:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] }];
  const now = new Date('2026-02-01T00:00:00Z');

  it('non-viewer sees their own items', () => {
    const s = gatheringDateStatus({}, items, 'u1', 'member', now);
    expect(s.key).toBe('upcoming');
    expect(formatGatheringRange({}, items, 'u1', 'member')).toBeTruthy();
  });

  it('viewer falls back to all items', () => {
    const s = gatheringDateStatus({}, items, 'v1', 'viewer', now);
    expect(s.key).toBe('upcoming');
  });
});

// ---- mainEventOf / mainEventAddress ----

describe('mainEventOf / mainEventAddress', () => {
  it('mainEventOf returns the main event item or null', () => {
    expect(mainEventOf([{ type: 'hotel' }, { type: 'main_event', start_datetime: '2026-06-01T10:00:00Z' }]).type).toBe('main_event');
    expect(mainEventOf([{ type: 'hotel' }])).toBeNull();
    expect(mainEventOf([])).toBeNull();
  });

  it('mainEventAddress uses place.address (full address, not inferred city)', () => {
    const item = { type: 'main_event', place: { name: 'Central Park', address: 'Central Park, New York, NY, USA' } };
    expect(mainEventAddress(item)).toBe('Central Park, New York, NY, USA');
  });

  it('mainEventAddress falls back to place.name then location_name', () => {
    expect(mainEventAddress({ type: 'main_event', place: { name: 'Central Park' } })).toBe('Central Park');
    expect(mainEventAddress({ type: 'main_event', location_name: 'Central Park' })).toBe('Central Park');
    expect(mainEventAddress({ type: 'main_event' })).toBe('');
    expect(mainEventAddress(null)).toBe('');
  });
});

// ---- inclusiveDayCount ----

describe('inclusiveDayCount', () => {
  it('same-day = 1', () => {
    expect(inclusiveDayCount('2026-03-10T08:00:00Z', '2026-03-10T20:00:00Z')).toBe(1);
  });

  it('next-day = 2', () => {
    expect(inclusiveDayCount('2026-03-10T08:00:00Z', '2026-03-11T08:00:00Z')).toBe(2);
  });

  it('multi-day counts both endpoints (+1)', () => {
    expect(inclusiveDayCount('2026-03-10T08:00:00Z', '2026-03-19T08:00:00Z')).toBe(10);
  });

  it('DST-safe: spring-forward does not change the count', () => {
    // 2026-03-08 is a spring-forward (US DST) date; calendar days still count
    expect(inclusiveDayCount('2026-03-07T10:00:00Z', '2026-03-10T10:00:00Z')).toBe(4);
  });

  it('returns 0 for missing/invalid', () => {
    expect(inclusiveDayCount(null, '2026-03-10T08:00:00Z')).toBe(0);
    expect(inclusiveDayCount('2026-03-10T08:00:00Z', null)).toBe(0);
    expect(inclusiveDayCount('not-a-date', '2026-03-10T08:00:00Z')).toBe(0);
  });
});

// ---- selectedItemsForRange ----

describe('selectedItemsForRange', () => {
  it('participant-first: own attendee items', () => {
    const items = [
      { type: 'hotel', owner_id: 'u1', attendee_user_ids: ['u1'] },
      { type: 'activity', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    const sel = selectedItemsForRange(items, 'u1');
    expect(sel).toHaveLength(1);
    expect(sel[0].type).toBe('hotel');
  });

  it('falls back to all when no own items (viewer or otherwise)', () => {
    const items = [
      { type: 'hotel', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    expect(selectedItemsForRange(items, 'v1')).toEqual(items);
    expect(selectedItemsForRange(items, null)).toEqual(items);
  });
});

// ---- formatGatheringCardMeta ----

const mockT = (key, params) => {
  const dict = { 'gatheringCard.daysDuration': { one: `${params?.count} day`, other: `${params?.count} days` } };
  const v = dict[key];
  if (typeof v === 'object' && params) return params.count === 1 ? v.one : v.other;
  return key;
};
const mockFmt = {
  t: mockT,
  formatDateTime: (iso, tz) => 'Oct 12, 11:15 PM',
  formatDate: (d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  },
};

describe('deriveGatheringMeta — Main Event', () => {
  it('event mode: when + address; no end date or duration', () => {
    const items = [{
      type: 'main_event',
      start_datetime: '2026-10-12T11:15:00Z',
      end_datetime: '2026-10-12T15:00:00Z',
      place: { name: 'Central Park', address: 'Central Park, New York, NY, USA', tz: 'America/New_York' },
    }];
    const meta = deriveGatheringMeta({}, items, 'u1', 'member', mockFmt);
    expect(meta.mode).toBe('event');
    expect(meta.when).toBe('Oct 12, 11:15 PM');
    expect(meta.address).toBe('Central Park, New York, NY, USA');
    expect(meta).not.toHaveProperty('days');
    expect(meta).not.toHaveProperty('rangeStart');
  });

  it('uses the event own tz; partial when no address', () => {
    const items = [{ type: 'main_event', start_datetime: '2026-10-12T11:15:00Z', place: { tz: 'America/New_York' } }];
    const meta = deriveGatheringMeta({}, items, 'u1', 'member', mockFmt);
    expect(meta.mode).toBe('event');
    expect(meta.when).toBe('Oct 12, 11:15 PM');
    expect(meta.address).toBe('');
  });

  it('Main Event prevails for a viewer too', () => {
    const items = [{ type: 'main_event', start_datetime: '2026-10-12T11:15:00Z', place: { address: 'Addr' } }];
    const meta = deriveGatheringMeta({}, items, 'v1', 'viewer', mockFmt);
    expect(meta.mode).toBe('event');
    expect(meta.address).toBe('Addr');
  });
});

describe('deriveGatheringMeta — no Main Event', () => {
  it('range mode: rangeStart/rangeEnd + daysLabel; no address', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-10T08:00:00Z', end_datetime: '2026-03-12T08:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] },
    ];
    const meta = deriveGatheringMeta({}, items, 'u1', 'member', mockFmt);
    expect(meta.mode).toBe('range');
    expect(meta.days).toBe(3);
    expect(meta.daysLabel).toBe('3 days');
    expect(meta.address).toBeUndefined();
  });

  it('same-day range: days = 1, daysLabel = "1 day"', () => {
    const items = [{ type: 'hotel', start_datetime: '2026-03-10T08:00:00Z', end_datetime: '2026-03-10T20:00:00Z', owner_id: 'u1', attendee_user_ids: ['u1'] }];
    const meta = deriveGatheringMeta({}, items, 'u1', 'member', mockFmt);
    expect(meta.days).toBe(1);
    expect(meta.daysLabel).toBe('1 day');
  });

  it('participant-first for viewer with own items', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-10T08:00:00Z', end_datetime: '2026-03-10T20:00:00Z', owner_id: 'v1', attendee_user_ids: ['v1'] },
      { type: 'activity', start_datetime: '2026-04-01T08:00:00Z', owner_id: 'other', attendee_user_ids: ['other'] },
    ];
    const meta = deriveGatheringMeta({}, items, 'v1', 'viewer', mockFmt);
    expect(meta.days).toBe(1);
    expect(meta.daysLabel).toBe('1 day');
  });

  it('empty/invalid dates produce tbd mode, never NaN', () => {
    expect(deriveGatheringMeta({}, [], 'u1', 'member', mockFmt).mode).toBe('tbd');
    expect(deriveGatheringMeta({}, [{ type: 'hotel' }], 'u1', 'member', mockFmt).mode).toBe('tbd');
  });
});