import { TZ_COUNTRY } from './googlePlaces.ts';

// Shared primitives for the passport / community signals: one definition of
// "which country is this place", "which calendar day is this instant" and "is
// this a real user id", used by getPassport and getCommunitySignals so the two
// can never disagree about a stamp or a companion.
export const ISO2 = /^[A-Z]{2}$/;

// A place stores the ISO short_name from Google address components; when a
// legacy row has no country, the IANA timezone is a safe fallback.
export function countryOf(place: any): string {
  if (!place || typeof place !== 'object') return '';
  const code = String(place.country || '').trim().toUpperCase();
  if (ISO2.test(code)) return code;
  const tz = String(place.tz || '').trim();
  return tz ? (TZ_COUNTRY[tz] || '') : '';
}

export function dayOf(value: any): string {
  const s = String(value || '');
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
}

export const isRealUserId = (v: any) => /^[0-9a-f]{24}$/i.test(String(v || ''));