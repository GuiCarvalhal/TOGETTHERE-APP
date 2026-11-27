import { isParticipant } from '@/lib/gatheringHelpers';

// How many people (and households) actually share this expense. Splits are
// stored per person, so people = distinct split members that are still trip
// participants (a legacy viewer split is never shown); families = distinct
// FAMILY units among them, so a household sharing a cost reads as one party.
// `unitOf` is the family-unit lookup from useExpensesData (optional — without
// it every person counts as their own unit).
export function participationOf(splits, memberById, unitOf) {
  const people = new Set();
  const units = new Map();
  (splits || []).forEach((s) => {
    const m = memberById?.[s.member_id];
    if (!m || !isParticipant(m.role) || people.has(m.id)) return;
    people.add(m.id);
    const u = unitOf ? unitOf(m.id) : null;
    units.set(u?.key || m.id, u?.type === 'family');
  });
  return {
    people: people.size,
    families: [...units.values()].filter(Boolean).length,
  };
}

export default participationOf;