// Backend mirror of src/lib/formatPlaceTime.js#wallTimeToUtcIso.
//
// The standard journey form collects a wall-clock value ("YYYY-MM-DDTHH:MM")
// and stores the UTC instant of that clock time in the place's own timezone.
// Inbox imports must land in the DB exactly the same way, so this module owns
// the identical algorithm server-side. Keep the two in lockstep: a change to
// one is a change to both.

export const WALL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function tzOffsetMs(tz: string, dateMs: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(dateMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  let h = get('hour');
  if (h === '24') h = '00';
  const wallAsUtc = Date.UTC(
    Number(get('year')), Number(get('month')) - 1, Number(get('day')),
    Number(h), Number(get('minute')), Number(get('second')),
  );
  return wallAsUtc - dateMs;
}

// "YYYY-MM-DDTHH:MM" (+ place IANA tz) -> UTC ISO. Without a timezone the wall
// value is taken as UTC: the form falls back to the *viewer's* local zone,
// which a backend cannot know, so UTC is the only deterministic choice.
export function wallTimeToUtcIso(wall: unknown, timeZone?: string | null): string | undefined {
  const text = typeof wall === 'string' ? wall.trim() : '';
  if (!text) return undefined;
  const [d, t] = text.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = (t || '00:00').split(':').map(Number);
  if (![y, mo, da, h, mi].every((n) => Number.isFinite(n))) return undefined;
  const asUtcGuess = Date.UTC(y, mo - 1, da, h, mi);
  if (!timeZone) return new Date(asUtcGuess).toISOString();
  let offset: number;
  try {
    offset = tzOffsetMs(timeZone, asUtcGuess);
  } catch {
    return new Date(asUtcGuess).toISOString(); // unknown tz id — never invent a shift
  }
  return new Date(asUtcGuess - offset).toISOString();
}

// The calendar day of a wall value ("YYYY-MM-DD"), used for provider lookups
// that need a local departure date.
export function wallDay(wall: unknown): string {
  const text = typeof wall === 'string' ? wall.trim() : '';
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}