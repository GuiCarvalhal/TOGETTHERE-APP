import { buildSplitUnits } from '@/lib/gatheringHelpers';

// Family-unit attribution.
//
// Storage keeps one ExpenseSplit per PERSON (that is what the balance engine
// needs to sum exactly to the expense). Reporting is different: a household
// with 2+ participants is ONE expense unit, so its share is never divided
// between its members on screen — every member of the family sees the family's
// integral share, paid amount and balance. Aggregating over the unit (instead
// of adding member views together) is what keeps the global close from
// counting a household's cost twice.
export function buildMemberUnits(participants, families = []) {
  const units = buildSplitUnits(participants, families);
  const byMember = {};
  const byKey = {};
  units.forEach((u) => {
    byKey[u.key] = u;
    u.members.forEach((m) => { byMember[m.id] = u; });
  });
  return { units, byMember, byKey };
}

// Every member id the given member shares an expense unit with (itself alone
// when it belongs to no family).
export function unitMemberIdsOf(byMember, memberId) {
  const unit = byMember[memberId];
  return unit ? unit.members.map((m) => m.id) : [memberId];
}

// Sums a per-member amount over the member's whole unit.
export function sumOverUnit(byMember, memberId, amountFor) {
  return unitMemberIdsOf(byMember, memberId).reduce((sum, id) => sum + (amountFor(id) || 0), 0);
}