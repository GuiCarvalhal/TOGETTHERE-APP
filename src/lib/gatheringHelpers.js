// Pure helpers for TOGETTHERE: roles, relationships, expense math, formatting.

export const ROLES = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' };

// Admin = co-organizer: an active participant exactly like Owner/Member —
// sees/adds expenses & agent, can be a payer/split/attendee — and manages
// members & edits shared journey items. Cannot delete the gathering, change
// settings, or remove/change the Owner (owner-only).
export function canEditGathering(role) { return role === 'owner'; }
export function canManageMembers(role) { return role === 'owner' || role === 'admin'; }
export function canManageRoles(role) { return role === 'owner' || role === 'admin'; }
export function canRemoveMembers(role) { return role === 'owner' || role === 'admin'; }
export function canAddJourney(role) { return role === 'owner' || role === 'admin' || role === 'member'; }
export function canEditJourneyItem(role, item, currentMember) {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'member' && item?.owner_id === currentMember?.user_id) return true;
  return false;
}
// Delete is more restrictive than edit: only the item creator or the gathering
// owner can delete a segment (gathering admins can edit but not delete). This
// matches the permission enforced by the deleteJourneyItem backend function,
// so the trash button only appears for users who can actually delete — no
// silent RLS denials.
export function canDeleteJourneyItem(role, item, currentMember) {
  if (role === 'owner') return true;
  if (item?.owner_id === currentMember?.user_id) return true;
  return false;
}
export function canAddExpense(role) { return role === 'owner' || role === 'admin' || role === 'member'; }
export function canSeeExpenses(role) { return role === 'owner' || role === 'admin' || role === 'member'; }
export function canSeeAgent(role) { return role === 'owner' || role === 'admin' || role === 'member'; }
export function canManageGathering(role) { return role === 'owner'; }
export function isParticipant(role) { return role === 'owner' || role === 'admin' || role === 'member'; }

// Invite (share-link) permission: owner, admin and member can share
// Member/Viewer invite links. Viewers cannot. Role/member management (change
// role, remove) stays owner/admin only via canManageMembers.
export function canInviteMembers(role) { return role === 'owner' || role === 'admin' || role === 'member'; }

// Expenses Mine scope: ONLY expenses where the current member is the payer —
// NOT expenses where the member is merely included in the split. This is the
// Phase 1 change: previously Mine included split membership, which mixed
// "what I paid" with "what I owe". Now Mine = "what I paid" exclusively.
export function mineExpenses(expenses, currentMemberId) {
  if (!currentMemberId) return [];
  return expenses.filter((e) => e.payer_member_id === currentMemberId);
}

// Journey viewer forced defaults: Group scope (no participation), map OFF,
// images ON — regardless of any stale stored preference. Viewers get no
// filter/action bar at all; these values drive the content underneath.
export function journeyViewerForcedPrefs() {
  return { scope: 'group', mapOpen: false, images: true };
}

// Per-item participant user_ids: the opt-in attendee_user_ids, or — when no
// one has opted in (e.g. legacy items with empty attendee lists) — just the
// creator (owner_id). Flights never fall back to the creator: an empty
// attendee list means "no one joined yet". Never uses member_user_ids (the
// ACL list) or owner_user_id (the gathering owner). Pure so it can be unit
// tested and shared between card avatars and the viewer member filter.
export function itemParticipantUserIds(item) {
  if (!item) return [];
  if (item.type === 'flight') return item.attendee_user_ids || [];
  const attendees = item.attendee_user_ids || [];
  return attendees.length ? attendees : (item.owner_id ? [item.owner_id] : []);
}

// Filter journey items by selected member user_ids (ANY/OR semantics: an
// item matches when at least one of its participant user_ids is selected).
// An empty selected set returns no items (NOT a fallback to all). Pure so
// it can be unit-tested alongside itemParticipantUserIds.
export function filterJourneyByMembers(items, selectedIds) {
  if (!selectedIds || selectedIds.size === 0) return [];
  return (items || []).filter((it) =>
    itemParticipantUserIds(it).some((uid) => selectedIds.has(uid))
  );
}

// Eligible roster for the viewer member filter: participating roles
// (owner/admin/member), with a user_id, deduped by user_id. Viewers, unknown
// roles, and members missing a user_id are excluded. Pure so it can be
// unit-tested.
export function eligibleRosterMembers(members) {
  const seen = new Set();
  return (members || []).filter((m) => {
    if (!isParticipant(m.role)) return false;
    if (!m.user_id) return false;
    if (seen.has(m.user_id)) return false;
    seen.add(m.user_id);
    return true;
  });
}

// participant member ids (exclude viewers)
export function participantIds(members) {
  return members.filter((m) => isParticipant(m.role)).map((m) => m.id);
}

// Participants only (owner/member) — viewers excluded. Shared by every
// attendee/payer/split picker so viewers never appear in journey attendee
// selection or expense payer/split lists.
export function participantMembers(members) {
  return (members || []).filter((m) => isParticipant(m.role));
}

// Detect legacy viewer involvement in an existing expense: a saved split (or
// the saved payer) whose member is no longer a participant (i.e. now a
// Viewer). Returns the offending member ids so the form can show an actionable
// warning and block the save — legacy viewer allocations are never silently
// dropped/redistributed, and financial records are never migrated. Pure so it
// can be unit-tested.
export function legacyViewerAllocationIds(participants, splits, payerMemberId) {
  const participantIds = new Set((participants || []).map((m) => m.id));
  const viewerSplitIds = (splits || [])
    .filter((s) => !participantIds.has(s.member_id))
    .map((s) => s.member_id);
  const viewerPayerId =
    payerMemberId && !participantIds.has(payerMemberId) ? payerMemberId : null;
  return {
    viewerSplitIds,
    viewerPayerId,
    hasLegacy: viewerSplitIds.length > 0 || !!viewerPayerId,
  };
}

// The Casual/Close friendship model has been retired. Membership roles
// (owner/admin/member/viewer) are the only relationship dimension, always
// scoped to a specific gathering. Visibility is role-based: participants see
// full member detail, viewers see limited — no per-pair sharing level.

// All formatters accept an optional locale (Intl string, e.g. 'en-US', 'pt-BR')
// as the LAST argument, defaulting to 'en-US'. The browser locale never changes
// stored amounts or dates — only the display format. Date-only strings parse as
// local calendar dates (not UTC) so the day is stable in every timezone.

export function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  const n = Number(amount || 0);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function formatDate(d, opts = { month: 'short', day: 'numeric' }, locale = 'en-US') {
  if (!d) return '';
  try {
    const s = String(d);
    // Date-only strings parse as UTC and shift a day in western timezones;
    // parse as a local calendar date so the date is stable everywhere.
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    return dt.toLocaleDateString(locale, opts);
  } catch { return d; }
}

export function formatDateRange(start, end, locale = 'en-US') {
  const s = formatDate(start, { month: 'short', day: 'numeric' }, locale);
  const e = formatDate(end, { month: 'short', day: 'numeric' }, locale);
  if (s && e) return `${s} – ${e}`;
  return s || e;
}

// Trip status from dates. Returns { key, label, tone }.
// key: 'upcoming' | 'active' | 'completed' | 'planning' (undated).
// tone: 'terra' | 'green' | 'muted' — mapped to classes in the UI.
// Labels are localized via the t function when provided (for the GatheringCard
// date label). Falls back to English when t is not provided.
export function getGatheringStatus(g, now = new Date(), t) {
  const L = (k, p) => t ? t(k, p) : null;
  if (!g.start_date && !g.end_date) return { key: 'planning', label: L('gatheringStatus.planning') || 'Planning', tone: 'muted' };
  const start = g.start_date ? new Date(g.start_date + 'T00:00:00') : null;
  const end = g.end_date ? new Date(g.end_date + 'T23:59:59') : (start ? new Date(start.getTime() + 86400000 - 1) : null);
  if (start && now < start) {
    const days = Math.ceil((start - now) / 86400000);
    return {
      key: 'upcoming',
      label: days <= 0 ? (L('gatheringStatus.startsToday') || 'Starts today') : days === 1 ? (L('gatheringStatus.tomorrow') || 'Tomorrow') : (L('gatheringStatus.inDays', { count: days }) || `In ${days} days`),
      tone: 'terra',
    };
  }
  if (start && end && now >= start && now <= end) return { key: 'active', label: L('gatheringStatus.inProgress') || 'In progress', tone: 'green' };
  if (end && now > end) return { key: 'completed', label: L('gatheringStatus.completed') || 'Completed', tone: 'muted' };
  return { key: 'planning', label: L('gatheringStatus.planning') || 'Planning', tone: 'muted' };
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

// ---- Split-unit model (a family group counts as ONE split unit) ----

// Build split units from gathering participants + families. A family with
// >=2 participants becomes ONE unit (key `fam:<id>`); remaining participants
// are individual units (key = member id). Stable order by the first
// participant's index. A user appears in exactly one unit (first family wins
// for the rare duplicate-membership case). No records are merged.
export function buildSplitUnits(participants, families = []) {
  const usedUids = new Set();
  const index = (m) => participants.findIndex((p) => p.id === m.id);
  const famUnits = families
    .map((f) => ({
      f,
      members: participants.filter(
        (m) => m.user_id && ((f.memberUserIds || []).includes(m.user_id) || f.owner_user_id === m.user_id)
      ),
    }))
    .filter((u) => u.members.length >= 2)
    .sort((a, b) => index(a.members[0]) - index(b.members[0]));
  const units = [];
  famUnits.forEach((u) => {
    const members = u.members.filter((m) => !usedUids.has(m.user_id));
    if (members.length < 2) return; // not enough after dedup
    members.forEach((m) => usedUids.add(m.user_id));
    units.push({ key: `fam:${u.f.id}`, type: 'family', name: u.f.name, members });
  });
  participants.forEach((m) => {
    if (m.user_id && usedUids.has(m.user_id)) return;
    units.push({ key: m.id, type: 'member', members: [m] });
  });
  return units;
}

// Per-unit amounts for the selected unit keys. Equal + custom sum exactly to
// total (floor + remainder); by_share mirrors the existing weighted approach.
export function computeUnitAmounts(method, total, selectedKeys, inputs = {}) {
  const t = Math.round(Number(total || 0) * 100) / 100;
  const keys = selectedKeys || [];
  if (method === 'equal') {
    const n = keys.length || 1;
    const each = Math.floor(t * 100 / n) / 100;
    let remainder = Math.round((t - each * n) * 100);
    const res = {};
    keys.forEach((k) => {
      let amt = each;
      if (remainder > 0) { amt += 0.01; remainder -= 1; }
      res[k] = Math.round(amt * 100) / 100;
    });
    return res;
  }
  if (method === 'by_share') {
    const totalShare = keys.reduce((s, k) => s + (Number(inputs[k]) || 0), 0) || 1;
    const res = {};
    keys.forEach((k) => {
      const w = Number(inputs[k]) || 0;
      res[k] = Math.round((t * w / totalShare) * 100) / 100;
    });
    return res;
  }
  const res = {};
  keys.forEach((k) => { res[k] = Math.round(Number(inputs[k] || 0) * 100) / 100; });
  return res;
}

// Distribute an amount equally among n members (floor + remainder) so the
// parts sum exactly to the amount.
function distributeEvenly(amount, n) {
  if (n <= 1) return [Math.round(amount * 100) / 100];
  const each = Math.floor(amount * 100 / n) / 100;
  let remainder = Math.round((amount - each * n) * 100);
  const parts = [];
  for (let i = 0; i < n; i++) {
    let amt = each;
    if (remainder > 0) { amt += 0.01; remainder -= 1; }
    parts.push(Math.round(amt * 100) / 100);
  }
  return parts;
}

// Expand per-unit amounts to per-member amounts. Family units split their unit
// amount equally among their members; individual units pass through. The
// per-member amounts are what get saved (one ExpenseSplit per member) so the
// existing per-person balance math is unchanged.
export function expandUnitAmountsToMembers(units, unitAmounts) {
  const res = {};
  units.forEach((u) => {
    const ua = Number(unitAmounts[u.key] || 0);
    const parts = distributeEvenly(ua, u.members.length);
    u.members.forEach((m, i) => { res[m.id] = parts[i]; });
  });
  return res;
}

// Reconstruct the unit selection for an existing expense from its saved
// per-member splits. Families are grouped only when cleanly representable
// (all participant members saved with equal amounts/shares); otherwise the
// form falls back to individual units so historical splits are preserved
// exactly and never silently changed.
export function reconstructEditSelection(participants, families, splits, method) {
  const savedAmt = {}; const savedShare = {};
  (splits || []).forEach((s) => {
    savedAmt[s.member_id] = Number(s.amount) || 0;
    savedShare[s.member_id] = Number(s.share) || 0;
  });
  const savedIds = new Set(Object.keys(savedAmt));
  const grouped = buildSplitUnits(participants, families);
  let safe = true;
  grouped.forEach((u) => {
    if (u.type !== 'family') return;
    const ids = u.members.map((m) => m.id);
    const inCount = ids.filter((id) => savedIds.has(id)).length;
    if (inCount !== 0 && inCount !== ids.length) { safe = false; return; }
    if (inCount === ids.length) {
      const amts = ids.map((id) => savedAmt[id]);
      const shs = ids.map((id) => savedShare[id]);
      const eq = method === 'by_share'
        ? shs.every((s) => Math.abs(s - shs[0]) < 0.005)
        : amts.every((a) => Math.abs(a - amts[0]) < 0.005);
      if (!eq) safe = false;
    }
  });
  if (!safe) {
    const units = participants.map((m) => ({ key: m.id, type: 'member', members: [m] }));
    const selected = participants.filter((m) => savedIds.has(m.id)).map((m) => m.id);
    const inputs = {};
    selected.forEach((id) => { inputs[id] = method === 'by_share' ? savedShare[id] : savedAmt[id]; });
    return { units, selected, inputs };
  }
  const selected = []; const inputs = {};
  grouped.forEach((u) => {
    if (u.type === 'family') {
      const ids = u.members.map((m) => m.id);
      if (ids.every((id) => savedIds.has(id))) {
        selected.push(u.key);
        if (method === 'by_share') inputs[u.key] = savedShare[ids[0]];
        else if (method === 'custom') inputs[u.key] = Math.round(ids.reduce((a, id) => a + savedAmt[id], 0) * 100) / 100;
      }
    }
  });
  grouped.forEach((u) => {
    if (u.type !== 'member') return;
    const id = u.members[0].id;
    if (savedIds.has(id)) {
      selected.push(u.key);
      if (method === 'by_share') inputs[u.key] = savedShare[id];
      else if (method === 'custom') inputs[u.key] = savedAmt[id];
    }
  });
  return { units: grouped, selected, inputs };
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

// Distinct accent color per journey type — used for tinted medallions and
// graceful placeholder covers. Hex values render theme-aware via opacity tints.
export const JOURNEY_TYPES = [
  { key: 'hotel', label: 'Stay', icon: 'Hotel', color: '#F59E0B' },
  { key: 'activity', label: 'Activity', icon: 'Compass', color: '#10B981' },
  { key: 'main_event', label: 'Main Event', icon: 'Star', color: '#E05C48' },
  { key: 'flight', label: 'Flight', icon: 'Plane', color: '#0EA5E9' },
  { key: 'car', label: 'Drive', icon: 'Car', color: '#E05A47' },
  { key: 'train', label: 'Train', icon: 'Train', color: '#8B5CF6' },
  { key: 'cruise', label: 'Cruise', icon: 'Ship', color: '#14B8A6' },
  { key: 'other', label: 'Other', icon: 'MapPin', color: '#64748B' },
];

export function timeAgo(date, locale = 'en-US') {
  const d = new Date(date);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (s < 45) return rtf.format(0, 'second');
  const m = Math.floor(s / 60);
  if (m < 60) return rtf.format(-m, 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return rtf.format(-h, 'hour');
  const days = Math.floor(h / 24);
  if (days < 7) return rtf.format(-days, 'day');
  const w = Math.floor(days / 7);
  if (w < 5) return rtf.format(-w, 'week');
  return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

export const EXPENSE_CATEGORIES = [
  { key: 'food', label: 'Food & Drink', icon: 'UtensilsCrossed', color: '#E05A47' },
  { key: 'activities', label: 'Activities', icon: 'Compass', color: '#C8493A' },
  { key: 'transport', label: 'Transport', icon: 'Car', color: '#F07865' },
  { key: 'lodging', label: 'Lodging', icon: 'Hotel', color: '#1E2633' },
  { key: 'other', label: 'Other', icon: 'Receipt', color: '#7a8290' },
];

// Common currencies for selectors. Includes all currencies seen in imported
// beta data (AUD, EUR, AED, USD, ...). Used by the expense form and the base
// currency dashboard selector.
export const COMMON_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'AED', 'JPY', 'CHF', 'BRL', 'MXN',
  'CNY', 'INR', 'NZD', 'SGD', 'HKD', 'SEK', 'NOK', 'DKK', 'PLN', 'ZAR',
  'TRY', 'ILS', 'KRW', 'THB', 'IDR', 'PHP', 'MYR', 'CZK', 'HUF', 'RON',
];

// Human-readable names for the selectable currency list, shown alongside the
// code in every currency selector (e.g. "USD — US Dollar").
export const CURRENCY_NAMES = {
  USD: 'US Dollar', EUR: 'Euro', GBP: 'British Pound', AUD: 'Australian Dollar',
  CAD: 'Canadian Dollar', AED: 'UAE Dirham', JPY: 'Japanese Yen', CHF: 'Swiss Franc',
  BRL: 'Brazilian Real', MXN: 'Mexican Peso', CNY: 'Chinese Yuan', INR: 'Indian Rupee',
  NZD: 'New Zealand Dollar', SGD: 'Singapore Dollar', HKD: 'Hong Kong Dollar',
  SEK: 'Swedish Krona', NOK: 'Norwegian Krone', DKK: 'Danish Krone', PLN: 'Polish Zloty',
  ZAR: 'South African Rand', TRY: 'Turkish Lira', ILS: 'Israeli Shekel', KRW: 'South Korean Won',
  THB: 'Thai Baht', IDR: 'Indonesian Rupiah', PHP: 'Philippine Peso', MYR: 'Malaysian Ringgit',
  CZK: 'Czech Koruna', HUF: 'Hungarian Forint', RON: 'Romanian Leu',
};

// "USD — US Dollar" for selectors; falls back to the bare code for unknown currencies.
export function currencyLabel(code) {
  const c = String(code || '').toUpperCase();
  return CURRENCY_NAMES[c] ? `${c} — ${CURRENCY_NAMES[c]}` : c;
}