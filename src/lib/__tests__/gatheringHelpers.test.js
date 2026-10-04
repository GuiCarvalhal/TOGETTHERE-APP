import { describe, it, expect } from 'vitest';
import {
  participantMembers,
  isParticipant,
  canSeeExpenses,
  canAddExpense,
  canSeeAgent,
  canAddJourney,
  canInviteMembers,
  canManageGathering,
  canEditGathering,
  canManageMembers,
  mineExpenses,
  journeyViewerForcedPrefs,
  legacyViewerAllocationIds,
  computeBalances,
  settleUp,
} from '@/lib/gatheringHelpers';

const members = [
  { id: 'm-owner', user_id: 'u-owner', role: 'owner' },
  { id: 'm-admin', user_id: 'u-admin', role: 'admin' },
  { id: 'm-mem', user_id: 'u-mem', role: 'member' },
  { id: 'm-viewer', user_id: 'u-viewer', role: 'viewer' },
  { id: 'm-self', user_id: 'u-self', role: 'viewer' },
];

describe('participantMembers — viewers excluded from pickers', () => {
  it('keeps owner + admin + member', () => {
    const pick = participantMembers(members).map((m) => m.id);
    expect(pick).toEqual(['m-owner', 'm-admin', 'm-mem']);
  });
  it('a viewer is still excluded', () => {
    expect(participantMembers(members).find((m) => m.role === 'viewer')).toBeUndefined();
  });
});

describe('role gating — viewers blocked from participation surfaces', () => {
  it('isParticipant is false for viewers, true for owner/admin/member', () => {
    expect(isParticipant('viewer')).toBe(false);
    expect(isParticipant('member')).toBe(true);
    expect(isParticipant('owner')).toBe(true);
    expect(isParticipant('admin')).toBe(true);
  });
  it('canSeeExpenses is false for viewers, true for owner/admin/member', () => {
    expect(canSeeExpenses('viewer')).toBe(false);
    expect(canSeeExpenses('member')).toBe(true);
    expect(canSeeExpenses('admin')).toBe(true);
    expect(canSeeExpenses('owner')).toBe(true);
  });
  it('canAddJourney is false for viewers', () => {
    expect(canAddJourney('viewer')).toBe(false);
    expect(canAddJourney('member')).toBe(true);
  });
});

describe('legacyViewerAllocationIds — block silent redistribution on edit', () => {
  const participants = [
    { id: 'm-owner', role: 'owner' },
    { id: 'm-mem', role: 'member' },
  ];
  it('flags a saved split for a member who is now a viewer', () => {
    const splits = [{ member_id: 'm-owner', amount: 40 }, { member_id: 'm-viewer', amount: 20 }];
    const r = legacyViewerAllocationIds(participants, splits, 'm-owner');
    expect(r.hasLegacy).toBe(true);
    expect(r.viewerSplitIds).toEqual(['m-viewer']);
    expect(r.viewerPayerId).toBe(null);
  });
  it('flags a saved payer who is now a viewer', () => {
    const splits = [{ member_id: 'm-owner', amount: 50 }];
    const r = legacyViewerAllocationIds(participants, splits, 'm-viewer');
    expect(r.hasLegacy).toBe(true);
    expect(r.viewerPayerId).toBe('m-viewer');
  });
  it('is clean when payer and all splits are current participants', () => {
    const splits = [{ member_id: 'm-owner', amount: 30 }, { member_id: 'm-mem', amount: 30 }];
    const r = legacyViewerAllocationIds(participants, splits, 'm-owner');
    expect(r.hasLegacy).toBe(false);
    expect(r.viewerSplitIds).toEqual([]);
    expect(r.viewerPayerId).toBe(null);
  });
});

describe('computeBalances — viewer debt is not discarded', () => {
  it('keeps a former-member (now viewer) split in the balance math', () => {
    // $90 paid by Alice (participant), split 3 ways: Alice, Bob (participant),
    // Carol (now viewer — not in memberIds). Each owes $30.
    const expenses = [{ id: 'e1', payer_member_id: 'm-alice', amount: 90, settled: false }];
    const splits = [
      { expense_id: 'e1', member_id: 'm-alice', amount: 30 },
      { expense_id: 'e1', member_id: 'm-bob', amount: 30 },
      { expense_id: 'e1', member_id: 'm-carol', amount: 30 },
    ];
    // Only participants are passed as memberIds (viewers excluded from display).
    const bal = computeBalances(expenses, splits, ['m-alice', 'm-bob']);
    // Alice paid 90, owes 30 => +60. Bob owes 30 => -30. Carol owes 30 (kept).
    expect(bal['m-alice']).toBe(60);
    expect(bal['m-bob']).toBe(-30);
    expect(bal['m-carol']).toBe(-30); // debt preserved, not discarded
  });
});

describe('mineExpenses — Mine = payer only, NOT split membership', () => {
  const expenses = [
    { id: 'e1', payer_member_id: 'm-alice', amount: 90, currency: 'USD' },
    { id: 'e2', payer_member_id: 'm-bob', amount: 50, currency: 'USD' },
    { id: 'e3', payer_member_id: 'm-alice', amount: 30, currency: 'EUR' },
  ];
  it('returns only expenses where the current member is the payer', () => {
    const mine = mineExpenses(expenses, 'm-alice');
    expect(mine.map((e) => e.id)).toEqual(['e1', 'e3']);
  });
  it('does NOT include expenses where the member is merely in the split', () => {
    // Bob paid e2; Alice is in the split but not the payer — must be excluded.
    const mine = mineExpenses(expenses, 'm-alice');
    expect(mine.find((e) => e.id === 'e2')).toBeUndefined();
  });
  it('returns empty when currentMemberId is null', () => {
    expect(mineExpenses(expenses, null)).toEqual([]);
    expect(mineExpenses(expenses, undefined)).toEqual([]);
  });
});

describe('canInviteMembers — active participants can share invite links', () => {
  it('owner can invite', () => { expect(canInviteMembers('owner')).toBe(true); });
  it('admin can invite', () => { expect(canInviteMembers('admin')).toBe(true); });
  it('member can invite', () => { expect(canInviteMembers('member')).toBe(true); });
  it('viewer cannot invite', () => { expect(canInviteMembers('viewer')).toBe(false); });
});

describe('journeyViewerForcedPrefs — viewer forced defaults', () => {
  it('forces Group scope, map OFF, images ON', () => {
    const p = journeyViewerForcedPrefs();
    expect(p.scope).toBe('group');
    expect(p.mapOpen).toBe(false);
    expect(p.images).toBe(true);
  });
});

describe('settleUp — viewers excluded from suggestions', () => {
  it('only settles among the provided (participant) balances', () => {
    // Alice is owed 60, Bob owes 30, Carol (viewer) owes 30.
    const balances = { 'm-alice': 60, 'm-bob': -30, 'm-carol': -30 };
    const txns = settleUp(balances);
    // Carol is present in the raw balances, but the hook passes only
    // participant balances to settleUp — verify the greedy matcher never
    // produces a transaction involving a viewer when viewers are excluded.
    const participantOnly = { 'm-alice': 60, 'm-bob': -30 };
    const safe = settleUp(participantOnly);
    expect(safe.every((t) => t.from !== 'm-carol' && t.to !== 'm-carol')).toBe(true);
    expect(safe).toEqual([{ from: 'm-bob', to: 'm-alice', amount: 30 }]);
    // sanity: the unfiltered call would include carol — proving the filter matters
    expect(txns.some((t) => t.from === 'm-carol' || t.to === 'm-carol')).toBe(true);
  });
});

describe('admin is an active participant exactly like owner/member', () => {
  it('isParticipant includes admin', () => { expect(isParticipant('admin')).toBe(true); });
  it('canSeeExpenses includes admin', () => { expect(canSeeExpenses('admin')).toBe(true); });
  it('canAddExpense includes admin', () => { expect(canAddExpense('admin')).toBe(true); });
  it('canSeeAgent includes admin', () => { expect(canSeeAgent('admin')).toBe(true); });
  it('canInviteMembers includes admin', () => { expect(canInviteMembers('admin')).toBe(true); });
  it('canAddJourney includes admin', () => { expect(canAddJourney('admin')).toBe(true); });
  it('participantMembers includes admin', () => {
    expect(participantMembers(members).map((m) => m.id)).toContain('m-admin');
  });
  it('canManageGathering is owner-only (admin excluded)', () => {
    expect(canManageGathering('admin')).toBe(false);
    expect(canManageGathering('owner')).toBe(true);
  });
  it('canEditGathering is owner-only (admin excluded)', () => {
    expect(canEditGathering('admin')).toBe(false);
    expect(canEditGathering('owner')).toBe(true);
  });
  it('canManageMembers is owner/admin only (member excluded)', () => {
    expect(canManageMembers('admin')).toBe(true);
    expect(canManageMembers('owner')).toBe(true);
    expect(canManageMembers('member')).toBe(false);
  });
});