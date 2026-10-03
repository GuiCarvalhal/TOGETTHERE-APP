import { describe, it, expect } from 'vitest';
import {
  participantMembers,
  closeFriendUserIds,
  itemsByCloseFriends,
  isParticipant,
  canSeeExpenses,
  canAddJourney,
} from '@/lib/gatheringHelpers';

const members = [
  { id: 'm-owner', user_id: 'u-owner', role: 'owner', myRelationship: 'casual' },
  { id: 'm-mem', user_id: 'u-mem', role: 'member', myRelationship: 'close' },
  { id: 'm-viewer', user_id: 'u-viewer', role: 'viewer', myRelationship: 'close' },
  { id: 'm-self', user_id: 'u-self', role: 'viewer', myRelationship: 'casual' },
];

describe('participantMembers — viewers excluded from pickers', () => {
  it('keeps only owner + member', () => {
    const pick = participantMembers(members).map((m) => m.id);
    expect(pick).toEqual(['m-owner', 'm-mem']);
  });
  it('a close viewer is still excluded', () => {
    expect(participantMembers(members).find((m) => m.role === 'viewer')).toBeUndefined();
  });
});

describe('closeFriendUserIds — viewer Close scope', () => {
  it('collects user_ids the current user marked close, excluding self', () => {
    const set = closeFriendUserIds(members, { id: 'm-self' });
    expect(set.has('u-mem')).toBe(true);
    expect(set.has('u-viewer')).toBe(true);
    expect(set.has('u-owner')).toBe(false);
    expect(set.has('u-self')).toBe(false);
  });
  it('is empty when nobody is close', () => {
    const set = closeFriendUserIds(
      members.map((m) => ({ ...m, myRelationship: 'casual' })),
      { id: 'm-self' }
    );
    expect(set.size).toBe(0);
  });
});

describe('itemsByCloseFriends', () => {
  const closeUids = new Set(['u-mem']);
  const items = [
    { id: 'i1', owner_id: 'u-mem', attendee_user_ids: [] },           // close creator
    { id: 'i2', owner_id: 'u-other', attendee_user_ids: ['u-mem'] },  // close attendee
    { id: 'i3', owner_id: 'u-other', attendee_user_ids: [] },          // unrelated
    { id: 'i4', owner_id: null, attendee_user_ids: ['u-viewer'] },     // viewer attendee only
  ];
  it('returns items a close friend created or attends', () => {
    expect(itemsByCloseFriends(items, closeUids).map((i) => i.id)).toEqual(['i1', 'i2']);
  });
  it('returns empty for an empty close set', () => {
    expect(itemsByCloseFriends(items, new Set())).toEqual([]);
  });
});

describe('role gating — viewers blocked from participation surfaces', () => {
  it('isParticipant is false for viewers', () => {
    expect(isParticipant('viewer')).toBe(false);
    expect(isParticipant('member')).toBe(true);
    expect(isParticipant('owner')).toBe(true);
  });
  it('canSeeExpenses is false for viewers', () => {
    expect(canSeeExpenses('viewer')).toBe(false);
    expect(canSeeExpenses('member')).toBe(true);
  });
  it('canAddJourney is false for viewers', () => {
    expect(canAddJourney('viewer')).toBe(false);
    expect(canAddJourney('member')).toBe(true);
  });
});