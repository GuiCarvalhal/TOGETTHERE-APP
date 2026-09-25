// Helpers for the flight search UI (kept out of the backend contract so the
// component stays focused). These mirror the server-side parsing in
// searchFlights/entry.ts so the frontend can convert a selected result into
// the journey form's datetime-local inputs and stored fields.

// Parse an AeroDataBox UTC string ("2026-09-25 02:40Z") to an ISO UTC instant.
export function parseUtcIso(raw) {
  if (!raw) return '';
  const s = String(raw).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

// Normalize a flight number for storage: "BA 208" -> "BA208".
export function normalizeNumber(n) {
  return String(n || '').replace(/\s+/g, '').toUpperCase();
}

// Best-effort IATA extraction from a Google Place name/address, e.g.
// "London Heathrow Airport (LHR)" -> "LHR". The backend validates any code we
// pass (via airportByIata) and falls back to nearest-airport, so a false
// positive here is harmless. Returns '' when no 3-letter code is present.
export function extractIata(place) {
  if (!place) return '';
  const text = `${place.name || ''} ${place.address || ''}`;
  const m = text.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : '';
}