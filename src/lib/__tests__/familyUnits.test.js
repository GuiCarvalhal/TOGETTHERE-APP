import { describe, it, expect } from 'vitest';
import { buildMemberUnits, unitMemberIdsOf, sumOverUnit } from '@/lib/familyUnits';
import { computeUnitAmounts, expandUnitAmountsToMembers } from '@/lib/gatheringHelpers';

// Family as an expense unit: a household's share is reported WHOLE for every
// member of that household, while the stored per-member splits still sum to the
// expense (so the balance engine and the global close never double count).
const participants = [
  { id: 'm-baron-1', user_id: 'u-baron-1', full_name: 'Ana Baron' },
  { id: 'm-baron-2', user_id: 'u-baron-2', full_name: 'Luis Carvalhal' },
  { id: 'm-solo', user_id: 'u-solo', full_name: 'Solo Traveler' },
];
const families = [{ id: 'fam-baron', name: 'Baron Carvalhal', memberUserIds: ['u-baron-1', 'u-baron-2'] }];

describe('buildMemberUnits — family is one unit', () => {
  it('groups family members into a single unit and leaves others alone', () => {
    const { units, byMember } = buildMemberUnits(participants, families);
    expect(units).toHaveLength(2); // family + solo
    expect(byMember['m-baron-1'].key).toBe('fam:fam-baron');
    expect(byMember['m-baron-2'].key).toBe('fam:fam-baron');
    expect(byMember['m-solo'].key).toBe('m-solo');
  });

  it('falls back to per-member units when there are no families', () => {
    const { units, byMember } = buildMemberUnits(participants, []);
    expect(units).toHaveLength(3);
    expect(unitMemberIdsOf(byMember, 'm-baron-1')).toEqual(['m-baron-1']);
  });
});

describe('unit-level reporting vs per-member storage', () => {
  it('each family member reflects the family share in full', () => {
    const { units, byMember } = buildMemberUnits(participants, families);
    const unitAmounts = computeUnitAmounts('equal', 100, ['fam:fam-baron', 'm-solo']);
    expect(unitAmounts['fam:fam-baron']).toBe(50);

    // Stored per person (what the balance engine needs) …
    const perMember = expandUnitAmountsToMembers(units, unitAmounts);
    expect(perMember['m-baron-1']).toBe(25);
    expect(perMember['m-baron-2']).toBe(25);

    // … but reported per unit: both members see the whole 50.
    const asSeenByFirst = sumOverUnit(byMember, 'm-baron-1', (id) => perMember[id] || 0);
    const asSeenBySecond = sumOverUnit(byMember, 'm-baron-2', (id) => perMember[id] || 0);
    expect(asSeenByFirst).toBe(50);
    expect(asSeenBySecond).toBe(50);

    // The global close counts the household ONCE (sum over units, not members).
    const globalTotal = units.reduce((sum, u) => (
      sum + u.members.reduce((s, m) => s + (perMember[m.id] || 0), 0)
    ), 0);
    expect(globalTotal).toBe(100);
  });

  it('keeps a solo member at their own share', () => {
    const { byMember } = buildMemberUnits(participants, families);
    expect(unitMemberIdsOf(byMember, 'm-solo')).toEqual(['m-solo']);
    expect(sumOverUnit(byMember, 'm-solo', () => 50)).toBe(50);
  });
});