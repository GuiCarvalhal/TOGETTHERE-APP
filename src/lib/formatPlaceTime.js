// Central timezone-aware date/time formatter for TOGETTHERE.
// ONE rule everywhere: every time is rendered in the LOCAL timezone of the
// relevant place (an IANA tz string, e.g. "Europe/Rome") and always carries the
// short timezone abbreviation in parentheses — e.g. "Jun 27 · 11:15 PM (CEST)".
// NEVER the viewer's device timezone. Date-only fields (no time component) use
// formatDateOnly / formatDayHeader, which parse the calendar date directly so it
// never shifts across timezones and need no abbreviation.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Short abbreviation (e.g. "CEST", "EDT", "BRT") for an IANA tz at a given instant.
export function tzAbbrAt(iso, timeZone) {
  if (!timeZone) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(new Date(iso));
    return parts.find((p) => p.type === 'timeZoneName')?.value || '';
  } catch { return ''; }
}

// "11:15 PM (CEST)" — time only, in the place's local tz with its real
// abbreviation. Returns '' while the tz is unknown (loading) so we never show a
// guessed offset or fake UTC; the time appears once the IANA tz resolves.
export function formatTimeTz(iso, timeZone) {
  if (!iso || !timeZone) return '';
  try {
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(iso));
    const abbr = tzAbbrAt(iso, timeZone);
    return abbr ? `${time} (${abbr})` : time;
  } catch { return ''; }
}

// "Jun 27" — date only, in the place tz (no abbreviation; date-only).
export function formatDateTz(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: timeZone || 'UTC' }).format(new Date(iso));
  } catch { return ''; }
}

// "Jun 27 · 11:15 PM (CEST)" — compact date + time.
export function formatDateTimeTz(iso, timeZone) {
  if (!iso) return '';
  return `${formatDateTz(iso, timeZone)} · ${formatTimeTz(iso, timeZone)}`;
}

// "Friday, June 27" — full date, in the place tz.
export function formatFullDateTz(iso, timeZone) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: timeZone || 'UTC' }).format(new Date(iso));
  } catch { return ''; }
}

// "Friday, June 27 · 11:15 PM (CEST)" — full date + time.
export function formatFullDateTimeTz(iso, timeZone) {
  if (!iso) return '';
  return `${formatFullDateTz(iso, timeZone)} · ${formatTimeTz(iso, timeZone)}`;
}

// "YYYY-MM-DD" — the calendar date of an instant in the place tz (for grouping).
export function tzDateKey(iso, timeZone) {
  if (!iso) return 'unscheduled';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: timeZone || 'UTC' }).formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return 'unscheduled'; }
}

// "Friday, June 27" from a date-only "YYYY-MM-DD" string (parsed as a calendar
// date, never shifted). Used for journey day-group headers.
export function formatDayHeader(dateStr) {
  if (!dateStr || dateStr === 'unscheduled') return 'No time set';
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(dateStr + 'T00:00:00'));
  } catch { return dateStr; }
}

// Date-only safe formatter for YYYY-MM-DD fields (gathering ranges, expense
// dates, member arrival/departure). Parses the calendar date directly so it
// never shifts, and shows no abbreviation (no time component).
export function formatDateOnly(d) {
  if (!d) return '';
  try {
    const s = String(d);
    const dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00') : new Date(s);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return d; }
}

// --- Flight status (AeroDataBox) ---
// AeroDataBox local times look like "2025-09-14 16:45+02:00" — the wall clock is
// already airport-local. When we know the airport's IANA tz we render that same
// instant in the airport tz with the real abbreviation; otherwise we fall back to
// the raw offset.
function parseOffsetInstant(raw) {
  let s = String(raw).replace(' ', 'T');
  s = s.replace(/(\d{2}:\d{2})([+-]\d{2}:\d{2})$/, '$1:00$2'); // insert seconds
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function fallbackLocal(raw) {
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}).*?([+-]\d{2}:\d{2})?/);
  if (!m) return raw;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)} · ${m[4]}${m[5] ? ` (UTC${m[5]})` : ''}`;
}
function fallbackTimeOnly(raw) {
  const m = String(raw).match(/[ T](\d{2}:\d{2}).*?([+-]\d{2}:\d{2})?/);
  return m ? `${m[1]}${m[2] ? ` (UTC${m[2]})` : ''}` : '';
}

// "Sep 14 · 4:45 PM (CEST)" from an AeroDataBox local string + airport IANA tz.
export function formatOffsetLocal(raw, timeZone) {
  if (!raw) return '';
  if (!timeZone) return fallbackLocal(raw);
  const instant = parseOffsetInstant(raw);
  if (!instant) return fallbackLocal(raw);
  try {
    const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone }).format(instant);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(instant);
    const abbr = tzAbbrAt(instant.toISOString(), timeZone);
    return `${date} · ${time} (${abbr})`;
  } catch { return fallbackLocal(raw); }
}
// "4:45 PM (CEST)" — time only, for the "Sched" sub-line.
export function formatOffsetTime(raw, timeZone) {
  if (!raw) return '';
  if (!timeZone) return fallbackTimeOnly(raw);
  const instant = parseOffsetInstant(raw);
  if (!instant) return fallbackTimeOnly(raw);
  try {
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(instant);
    const abbr = tzAbbrAt(instant.toISOString(), timeZone);
    return abbr ? `${time} (${abbr})` : time;
  } catch { return fallbackTimeOnly(raw); }
}

// --- Forms (datetime-local inputs) ---
// Convert a stored UTC instant to the place-tz wall time for an <input
// type="datetime-local"> value ("YYYY-MM-DDTHH:MM"), so the user edits the
// destination-local clock time.
export function isoToWallInput(iso, timeZone) {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timeZone || undefined }).formatToParts(new Date(iso));
    const get = (t) => parts.find((p) => p.type === t)?.value || '';
    let h = get('hour'); if (h === '24') h = '00';
    return `${get('year')}-${get('month')}-${get('day')}T${h}:${get('minute')}`;
  } catch { return ''; }
}
// Viewer-local wall input (fallback when no place tz is known).
export function isoToLocalInput(iso) {
  if (!iso) return '';
  return isoToWallInput(iso, undefined);
}
// Inverse: interpret a datetime-local wall value ("YYYY-MM-DDTHH:MM") as the
// place-tz local clock time and return the UTC ISO instant.
function tzOffsetMs(tz, dateMs) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(dateMs));
  const get = (t) => parts.find((p) => p.type === t)?.value || '';
  let h = get('hour'); if (h === '24') h = '00';
  const wallAsUtc = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')), Number(h), Number(get('minute')), Number(get('second')));
  return wallAsUtc - dateMs;
}
export function wallTimeToUtcIso(wallStr, timeZone) {
  if (!wallStr) return undefined;
  const [d, t] = wallStr.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = (t || '00:00').split(':').map(Number);
  if (!timeZone) return new Date(y, mo - 1, da, h, mi).toISOString(); // viewer local
  const asUtcGuess = Date.UTC(y, mo - 1, da, h, mi);
  const offset = tzOffsetMs(timeZone, asUtcGuess);
  return new Date(asUtcGuess - offset).toISOString();
}

// --- Journey item location → timezone key helpers ---
// The relevant place for a segment's start vs end time.
export function startLocation(item) {
  if (!item) return '';
  if (['flight', 'car', 'train', 'cruise'].includes(item.type)) {
    return item.location_from || item.location_to || item.location_name || '';
  }
  return item.location_name || item.location_to || item.location_from || '';
}
export function endLocation(item) {
  if (!item) return '';
  if (['flight', 'car', 'train', 'cruise'].includes(item.type)) {
    return item.location_to || item.location_from || item.location_name || '';
  }
  return item.location_name || item.location_to || item.location_from || '';
}

// "2h 30m" / "3d 4h" — duration between two instants (tz-independent, from the
// canonical stored UTC timestamps). Empty for missing/zero/negative spans.
export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!isFinite(ms) || ms <= 0) return '';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m ? `${h}h ${m}m` : `${h}h`;
  const days = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

// Heuristic all-day detection for display only: a segment whose local start is
// midnight and which has no end (or an end also at midnight). Timed items (a
// 4:45 PM flight) are never misclassified. Canonical stored timestamps are
// unchanged; this only affects how the card renders the time.
export function isAllDayItem(item, timeZone) {
  if (!item?.start_datetime) return false;
  const atMidnight = (iso) => {
    if (!iso) return false;
    try {
      const p = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timeZone || 'UTC' }).formatToParts(new Date(iso));
      const h = p.find((x) => x.type === 'hour')?.value;
      const m = p.find((x) => x.type === 'minute')?.value;
      return h === '00' && m === '00';
    } catch { return false; }
  };
  if (!atMidnight(item.start_datetime)) return false;
  if (!item.end_datetime) return true;
  return atMidnight(item.end_datetime);
}

// Metadata line above the title. Uses actual stored fields only; never invents
// values. Flight → flight number + carrier (carrier parsed from the lookup-
// generated title "Flight AA123 — American Airlines"); Stay/Activity → the
// Google Places name (location_name); Ride → the destination (location_to).
export function journeyMeta(item) {
  if (!item) return '';
  if (item.type === 'flight') {
    const num = (item.confirmation_number || '').trim();
    let carrier = '';
    const m = (item.title || '').match(/^[Ff]light\s+\S+\s+[—–-]\s+(.+)$/);
    if (m) carrier = m[1].trim();
    return [num && `Flight ${num}`, carrier].filter(Boolean).join(' · ');
  }
  if (item.type === 'car') return item.location_to || item.location_name || '';
  if (item.type === 'train') return item.location_to || item.location_from || '';
  return item.location_name || '';
}