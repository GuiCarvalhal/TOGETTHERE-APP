// One-shot marker for the Journey list: which segment it should land on.
//
// Set when a segment detail is left toward the journey page (Back from a
// segment opened in the list, or the "Open gathering" action on any segment),
// and read once when the journey page mounts. Module memory only — it lives for
// a single navigation, never survives a reload, and is cleared as soon as it is
// read, so a later visit through normal navigation still lands on today.
let pendingItemId = null;

// Navigation state stamped on a segment detail opened FROM the journey list, so
// Back can tell "returning to the list" from "returning to Home/another page".
// A shared constant (stable identity) keeps it safe as an effect dependency.
export const FROM_JOURNEY_STATE = { fromJourney: true };

export function markJourneyReturn(itemId) {
  pendingItemId = itemId || null;
}

export function consumeJourneyReturn() {
  const id = pendingItemId;
  pendingItemId = null;
  return id;
}

// ── Landing day ─────────────────────────────────────────────────────────────
// A day group key is a calendar date ('YYYY-MM-DD') in the SEGMENT's own
// timezone, or the literal 'unscheduled'. Only real dates can be compared.
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(key) {
  return typeof key === 'string' && DAY_KEY_RE.test(key);
}

// Today as a 'YYYY-MM-DD' key in the VIEWER's own timezone. Never UTC: at 21:00
// in New York, UTC is already tomorrow and the list would land on the wrong
// day. Intl resolves the device's zone, so this stays correct at home and while
// travelling; the manual local-parts path is only a fallback for old engines.
export function todayKeyInTz(now = new Date(), timeZone) {
  try {
    const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz,
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    const y = get('year');
    const m = get('month');
    const d = get('day');
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch { /* invalid zone: fall through to the device's own date */ }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Where a fresh Journey visit lands: TODAY when the list has it, otherwise the
// closest FUTURE day (the trip has not started, or today sits in a gap between
// blocks). A past-only list returns null, which means "stay at the top" — never
// a jump loop.
export function pickLandingDay(days, todayKey) {
  if (!Array.isArray(days) || !isDayKey(todayKey)) return null;
  const dated = days.filter(isDayKey).sort();
  if (!dated.length) return null;
  if (dated.includes(todayKey)) return todayKey;
  return dated.find((key) => key > todayKey) || null;
}