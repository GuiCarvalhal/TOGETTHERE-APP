import { ISO_ALPHA2_CODES } from '@/lib/isoCountries';

// Country names come from Intl.DisplayNames, so the picker and every stamp
// follow the app language without shipping a name table. The map is built once
// per locale and cached at module level.
let cache = null;

function namesFor(locale) {
  if (cache && cache.locale === locale) return cache.names;
  const names = {};
  ISO_ALPHA2_CODES.forEach((code) => {
    try {
      const dn = new Intl.DisplayNames([locale], { type: 'region' });
      names[code] = dn.of(code) || code;
    } catch {
      names[code] = code;
    }
  });
  cache = { locale, names };
  return names;
}

export function countryName(code, locale = 'en-US') {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return '';
  return namesFor(locale)[c] || c;
}

// Regional-indicator flag straight from the alpha-2 code — no image request and
// no asset per country. Falls back to a neutral flag for a code we don't know.
export function flagEmoji(code) {
  const c = String(code || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// Alphabetical { code, name } list for the picker, filtered by a free-text query
// that matches the localized name or the exact code.
export function searchCountries(query = '', locale = 'en-US') {
  const names = namesFor(locale);
  const q = String(query).trim().toLowerCase();
  return ISO_ALPHA2_CODES
    .map((code) => ({ code, name: names[code] || code }))
    .filter(({ code, name }) => !q || code.toLowerCase() === q || name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}