// Shared AeroDataBox (RapidAPI) helpers — airport-by-IATA and flight-by-number.
// Pure fetches with a single 429 retry; callers cache as needed. Server-side
// only; RAPIDAPI_KEY never reaches the client. Used by searchFlights and
// resolveFlightEnrichment so the airport-fetch logic lives in one place.

const RAPID_HOST = 'aerodatabox.p.rapidapi.com';

function headers(key: string) {
  return { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': RAPID_HOST };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Resolve an IATA code to AeroDataBox airport metadata, including the
// authoritative `municipality` (the metro city the airport serves) — the
// preferred city source for flight cards. Returns null on any failure.
export async function fetchAirportByIata(key: string, iata: string): Promise<{
  iata: string; municipality: string; country: string; tz: string; name: string; lat: number | null; lon: number | null;
} | null> {
  const url = `https://${RAPID_HOST}/airports/iata/${encodeURIComponent(iata)}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: headers(key) });
      if (res.status === 429 && attempt === 0) { await sleep(1200); continue; }
      if (!res.ok) return null;
      const d = await res.json();
      if (!d?.iata) return null;
      return {
        iata: d.iata,
        municipality: d.municipalityName || '',
        country: (d.country?.code || '').toUpperCase(),
        tz: d.timeZone || '',
        name: d.shortName || d.fullName || d.name || '',
        lat: d.location?.lat ?? null,
        lon: d.location?.lon ?? null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// Resolve a flight number + date to airline + origin/destination IATA via
// AeroDataBox. Prefers a non-codeshare entry. Returns null on any failure
// (including no data for past dates — caller surfaces an honest missing).
export async function fetchFlightByNumber(key: string, flightNumber: string, date: string): Promise<{
  airline: string; dep_iata: string; arr_iata: string; dep_name: string; arr_name: string;
} | null> {
  try {
    const url = `https://${RAPID_HOST}/flights/number/${encodeURIComponent(flightNumber)}/${encodeURIComponent(date)}`;
    const res = await fetch(url, { headers: headers(key) });
    if (!res.ok) return null;
    const data = await res.json();
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return null;
    const f = list.find((x: any) => !x.isCodeshare) || list[0];
    const dep = f.departure || {};
    const arr = f.arrival || {};
    return {
      airline: f.airline?.name || '',
      dep_iata: dep.airport?.iata || '',
      arr_iata: arr.airport?.iata || '',
      dep_name: dep.airport?.name || '',
      arr_name: arr.airport?.name || '',
    };
  } catch {
    return null;
  }
}