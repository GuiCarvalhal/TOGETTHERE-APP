import { describe, it, expect } from 'vitest';
import {
  itemInvolvesUser,
  rangeFromItems,
  deriveGatheringRange,
  deriveGatheringLocation,
  gatheringDateStatus,
  formatGatheringRange,
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
  it('viewer uses the gathering full set, not own items', () => {
    const items = [
      { type: 'hotel', start_datetime: '2026-03-01T00:00:00Z', owner_id: 'v1', attendee_user_ids: ['v1'] },
      { type: 'activity', start_datetime: '2026-04-01T00:00:00Z', owner_id: 'other' },
    ];
    // A viewer "v1" — should use ALL items, not just their own (which would be
    // the hotel). The activity (owned by someone else) is included.
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