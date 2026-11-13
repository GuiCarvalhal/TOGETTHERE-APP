// Live weather for one point at one instant, from Open-Meteo (no API key, no
// account, hourly resolution). Used by Home's Next/Now brief to state a real
// temperature and condition for the hour the traveller actually arrives, never
// a generic "check the forecast".
//
// Returns null on any failure so callers can drop the bullet instead of
// inventing one. The WMO weather code is returned raw; the human wording lives
// in the client dictionaries (wmo.* keys).

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

// The API's hourly.time values are LOCAL wall-clock strings of the requested
// point ("2026-11-13T18:00"), so the target instant is shifted into that same
// local frame (+ utc_offset_seconds) before the hour is matched.
function localHourKey(isoInstant, offsetSeconds) {
  const ms = new Date(isoInstant).getTime() + offsetSeconds * 1000;
  if (!isFinite(ms)) return '';
  return new Date(ms).toISOString().slice(0, 13);
}

export async function fetchWeatherAt(lat, lng, isoInstant) {
  if (num(lat) === null || num(lng) === null || !isoInstant) return null;
  const url = 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${lat}&longitude=${lng}`
    + '&hourly=temperature_2m,weather_code,precipitation_probability'
    + '&forecast_days=10&timezone=auto';
  let data = null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    data = await res.json();
  } catch { return null; }
  if (!data || !data.hourly) return null;

  const offset = num(data.utc_offset_seconds) || 0;
  const times = Array.isArray(data.hourly.time) ? data.hourly.time : [];
  const temps = Array.isArray(data.hourly.temperature_2m) ? data.hourly.temperature_2m : [];
  const codes = Array.isArray(data.hourly.weather_code) ? data.hourly.weather_code : [];
  const pops = Array.isArray(data.hourly.precipitation_probability) ? data.hourly.precipitation_probability : [];
  if (!times.length || !temps.length) return null;

  const key = localHourKey(isoInstant, offset);
  let index = times.findIndex((t) => String(t).slice(0, 13) === key);
  if (index < 0) {
    // Outside the hourly window (very old / very far ahead): clamp to the
    // nearest available hour rather than returning nothing.
    index = key < times[0] ? 0 : times.length - 1;
  }

  const tempC = num(temps[index]);
  if (tempC === null) return null;
  return {
    tempC,
    tempF: Math.round((tempC * 9) / 5 + 32),
    code: num(codes[index]),
    precipitation: num(pops[index]),
    tz: typeof data.timezone === 'string' ? data.timezone : '',
    // Local wall clock of the matched hour, e.g. "2026-11-13T18:00" — the
    // client formats it in the same tz with its abbreviation.
    localHour: times[index],
  };
}