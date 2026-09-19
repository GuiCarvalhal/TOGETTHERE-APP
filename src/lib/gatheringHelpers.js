// Pure helpers for TOGETTHERE: roles, relationships, expense math, formatting.

export const ROLES = { owner: 'Owner', member: 'Member', viewer: 'Viewer' };

export function canEditGathering(role) { return role === 'owner'; }
export function canManageRoles(role) { return role === 'owner'; }
export function canRemoveMembers(role) { return role === 'owner'; }
export function canAddJourney(role) { return role === 'owner' || role === 'member'; }
export function canEditJourneyItem(role, item, currentMember) {
  if (role === 'owner') return true;
  if (role === 'member' && item?.owner_id === currentMember?.user_id) return true;
  return false;
}
export function canAddExpense(role) { return role === 'owner' || role === 'member'; }
export function canSeeExpenses(role) { return role === 'owner' || role === 'member'; }
export function isParticipant(role) { return role === 'owner' || role === 'member'; }

// participant member ids (exclude viewers)
export function participantIds(members) {
  return members.filter((m) => isParticipant(m.role)).map((m) => m.id);
}

// Relationship visibility: returns 'full' | 'limited'
// Owners always see full detail for coordination. Otherwise depends on the
// private relationship the viewer set toward the target ('close' | 'casual').
export function visibilityFor(viewerRole, viewerRelationshipToTarget) {
  if (viewerRole === 'owner') return 'full';
  return viewerRelationshipToTarget === 'close' ? 'full' : 'limited';
}

export function relationshipLabel(rel) {
  if (rel === 'close') return 'Close';
  if (rel === 'casual') return 'Casual';
  return '—';
}

export function formatCurrency(amount, currency = 'USD') {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function formatDate(d, opts = { month: 'short', day: 'numeric' }) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-US', opts); } catch { return d; }
}

export function formatDateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// ---- Expense math ----

// Build split amounts for a new expense given method + participants + per-member inputs.
// participants: array of member ids. weights/amounts: { [memberId]: number }
export function computeSplitAmounts(method, total, participants, inputs = {}) {
  const result = {};
  const t = Math.round(Number(total || 0) * 100) / 100;
  if (method === 'equal') {
    const n = participants.length || 1;
    const each = Math.floor(t * 100 / n) / 100;
    let remainder = Math.round((t - each * n) * 100);
    participants.forEach((id, i) => {
      let amt = each;
      if (remainder > 0) { amt += 0.01; remainder -= 1; }
      result[id] = Math.round(amt * 100) / 100;
    });
    return result;
  }
  if (method === 'by_share') {
    const totalShare = participants.reduce((s, id) => s + (Number(inputs[id]) || 0), 0) || 1;
    participants.forEach((id) => {
      const w = Number(inputs[id]) || 0;
      result[id] = Math.round((t * w / totalShare) * 100) / 100;
    });
    return result;
  }
  // custom
  participants.forEach((id) => {
    result[id] = Math.round(Number(inputs[id] || 0) * 100) / 100;
  });
  return result;
}

// Running per-member balances from unsettled expenses + their splits.
// balance > 0 => is owed money; < 0 => owes money.
export function computeBalances(expenses, splits, memberIds) {
  const bal = {};
  memberIds.forEach((id) => { bal[id] = 0; });
  const splitByExpense = {};
  splits.forEach((s) => {
    if (!splitByExpense[s.expense_id]) splitByExpense[s.expense_id] = [];
    splitByExpense[s.expense_id].push(s);
  });
  expenses.forEach((e) => {
    if (e.settled) return;
    bal[e.payer_member_id] = (bal[e.payer_member_id] || 0) + Number(e.amount || 0);
    (splitByExpense[e.id] || []).forEach((s) => {
      bal[s.member_id] = (bal[s.member_id] || 0) - Number(s.amount || 0);
    });
  });
  // round
  Object.keys(bal).forEach((k) => { bal[k] = Math.round(bal[k] * 100) / 100; });
  return bal;
}

// Greedy minimal settle-up transactions from balances.
export function settleUp(balances) {
  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, v]) => {
    const r = Math.round(v * 100) / 100;
    if (r > 0.01) creditors.push({ id, amt: r });
    else if (r < -0.01) debtors.push({ id, amt: -r });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);
  const txns = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    txns.push({ from: debtors[i].id, to: creditors[j].id, amount: Math.round(pay * 100) / 100 });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.01) i++;
    if (creditors[j].amt < 0.01) j++;
  }
  return txns;
}

export const JOURNEY_TYPES = [
  { key: 'flight', label: 'Flight', icon: 'Plane' },
  { key: 'car', label: 'Car / Driver', icon: 'Car' },
  { key: 'hotel', label: 'Hotel / Stay', icon: 'Hotel' },
  { key: 'activity', label: 'Activity', icon: 'Compass' },
  { key: 'cruise', label: 'Cruise', icon: 'Ship' },
  { key: 'other', label: 'Other', icon: 'MapPin' },
];

export const EXPENSE_CATEGORIES = [
  { key: 'food', label: 'Food & Drink', icon: 'UtensilsCrossed', color: '#E05A47' },
  { key: 'lodging', label: 'Lodging', icon: 'Hotel', color: '#1E2633' },
  { key: 'transport', label: 'Transport', icon: 'Car', color: '#F07865' },
  { key: 'activities', label: 'Activities', icon: 'Compass', color: '#C8493A' },
  { key: 'other', label: 'Other', icon: 'Receipt', color: '#7a8290' },
];