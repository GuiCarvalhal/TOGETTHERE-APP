import { describe, it, expect } from 'vitest';
import {
  itemParticipantUserIds,
  filterJourneyByMembers,
  eligibleRosterMembers,
} from '@/lib/gatheringHelpers';

describe('itemParticipantUserIds', () => {
  it('returns attendee_user_ids for non-flight with attendees', () => {
    const item = { type: 'activity', attendee_user_ids: ['u1', 'u2'] };
    expect(itemParticipantUserIds(item)).toEqual(['u1', 'u2']);
  });

  it('falls back to owner_id for non-flight with empty attendees', () => {
    const item = { type: 'hotel', attendee_user_ids: [], owner_id: 'u1' };
    expect(itemParticipantUserIds(item)).toEqual(['u1']);
  });

  it('returns empty for non-flight with no attendees and no owner_id', () => {
    const item = { type: 'activity', attendee_user_ids: [] };
    expect(itemParticipantUserIds(item)).toEqual([]);
  });

  it('does NOT fall back to owner_id for flight with empty attendees', () => {
    const item = { type: 'flight', attendee_user_ids: [], owner_id: 'u1' };
    expect(itemParticipantUserIds(item)).toEqual([]);
  });

  it('returns attendee_user_ids for flight with attendees', () => {
    const item = { type: 'flight', attendee_user_ids: ['u1', 'u2'] };
    expect(itemParticipantUserIds(item)).toEqual(['u1', 'u2']);
  });

  it('never uses member_user_ids (ACL)', () => {
    const item = { type: 'activity', attendee_user_ids: [], member_user_ids: ['u1', 'u2'] };
    expect(itemParticipantUserIds(item)).toEqual([]);
  });

  it('never uses owner_user_id (gathering owner)', () => {
    const item = { type: 'activity', attendee_user_ids: [], owner_user_id: 'gatheringOwner' };
    expect(itemParticipantUserIds(item)).toEqual([]);
  });

  it('returns empty for null item', () => {
    expect(itemParticipantUserIds(null)).toEqual([]);
  });
});

describe('filterJourneyByMembers', () => {
  const items = [
    { id: '1', type: 'activity', attendee_user_ids: ['u1', 'u2'] },
    { id: '2', type: 'hotel', attendee_user_ids: [], owner_id: 'u3' },
    { id: '3', type: 'flight', attendee_user_ids: ['u1'] },
    { id: '4', type: 'flight', attendee_user_ids: [], owner_id: 'u2' },
    { id: '5', type: 'activity', attendee_user_ids: [], member_user_ids: ['u1', 'u2'] },
    { id: '6', type: 'activity', attendee_user_ids: [], owner_user_id: 'ownerUid' },
  ];

  it('any-of-2: matches item when at least one of two participants is selected', () => {
    const result = filterJourneyByMembers(items, new Set(['u2']));
    expect(result.map((r) => r.id)).toEqual(['1']);
  });

  it('multiple attendees: matches when any attendee is selected', () => {
    const result = filterJourneyByMembers(items, new Set(['u1']));
    expect(result.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('all off / no members: empty selected set returns no items', () => {
    expect(filterJourneyByMembers(items, new Set())).toEqual([]);
  });

  it('null selected set returns no items', () => {
    expect(filterJourneyByMembers(items, null)).toEqual([]);
  });

  it('ACL-only (member_user_ids) does not match', () => {
    const result = filterJourneyByMembers(items, new Set(['u1', 'u2']));
    expect(result.find((r) => r.id === '5')).toBeUndefined();
  });

  it('gathering-owner (owner_user_id) not a participant: does not match', () => {
    const result = filterJourneyByMembers(items, new Set(['ownerUid']));
    expect(result.find((r) => r.id === '6')).toBeUndefined();
  });

  it('nonflight creator fallback: matches when creator is selected', () => {
    const result = filterJourneyByMembers(items, new Set(['u3']));
    expect(result.map((r) => r.id)).toEqual(['2']);
  });

  it('flight-empty no creator fallback: does not match even if creator selected', () => {
    const result = filterJourneyByMembers(items, new Set(['u2']));
    expect(result.find((r) => r.id === '4')).toBeUndefined();
  });

  it('category composition: member filter is separate from category filter', () => {
    const memberFiltered = filterJourneyByMembers(items, new Set(['u1']));
    const activityOnly = memberFiltered.filter((it) => it.type === 'activity');
    expect(activityOnly.map((r) => r.id)).toEqual(['1']);
  });

  it('removed roster member: not in selected set => does not match', () => {
    const result = filterJourneyByMembers(items, new Set(['u2']));
    expect(result.find((r) => r.id === '3')).toBeUndefined();
  });

  it('new roster member: defaults ON (in selected set) => matches', () => {
    const newItems = [...items, { id: '7', type: 'activity', attendee_user_ids: ['u4'] }];
    const result = filterJourneyByMembers(newItems, new Set(['u1', 'u2', 'u3', 'u4']));
    expect(result.find((r) => r.id === '7')).toBeDefined();
  });
});

describe('eligibleRosterMembers', () => {
  const members = [
    { user_id: 'u1', role: 'owner', full_name: 'Alice' },
    { user_id: 'u2', role: 'admin', full_name: 'Bob' },
    { user_id: 'u3', role: 'member', full_name: 'Carol' },
    { user_id: 'u4', role: 'viewer', full_name: 'Dave' },
    { user_id: null, role: 'member', full_name: 'Eve' },
    { user_id: 'u1', role: 'member', full_name: 'Alice Again' },
    { user_id: 'u5', role: 'unknown', full_name: 'Frank' },
  ];

  it('excludes viewers', () => {
    expect(eligibleRosterMembers(members).find((m) => m.user_id === 'u4')).toBeUndefined();
  });

  it('excludes unknown roles', () => {
    expect(eligibleRosterMembers(members).find((m) => m.user_id === 'u5')).toBeUndefined();
  });

  it('excludes members with missing user_id', () => {
    expect(eligibleRosterMembers(members).find((m) => m.full_name === 'Eve')).toBeUndefined();
  });

  it('dedupes by user_id', () => {
    expect(eligibleRosterMembers(members).filter((m) => m.user_id === 'u1')).toHaveLength(1);
  });

  it('includes owner, admin, member in order', () => {
    expect(eligibleRosterMembers(members).map((m) => m.user_id)).toEqual(['u1', 'u2', 'u3']);
  });
});