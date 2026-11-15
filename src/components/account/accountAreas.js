import { UserRound, SlidersHorizontal, Plug, ShieldCheck, BookMarked } from 'lucide-react';

// The Account areas, in the order the hub lists them. One source of truth
// for the hub cards AND the area pages, so a card always lands on the page that
// shows that area and nothing else.
//   key      → the route segment: /account/<key>
//   titleKey → the card label and the area page title
//   descKey  → the one-line explanation shown on both
//
// Passport and Awards are ONE area ("Passport & Awards"): the passport book, the
// badge shelf and the bucket list are sections inside it, never separate menu
// entries.
export const ACCOUNT_AREAS = [
  { key: 'personal', Icon: UserRound, titleKey: 'account.menuPersonal', descKey: 'account.secPersonalDesc' },
  { key: 'passport-awards', Icon: BookMarked, titleKey: 'account.menuPassportAwards', descKey: 'account.secPassportAwardsDesc' },
  { key: 'preferences', Icon: SlidersHorizontal, titleKey: 'account.menuPreferences', descKey: 'account.secPreferencesDesc' },
  { key: 'integrations', Icon: Plug, titleKey: 'account.menuIntegrations', descKey: 'account.secIntegrationsDesc' },
  { key: 'security', Icon: ShieldCheck, titleKey: 'account.menuSecurity', descKey: 'account.secSecurityDesc' },
];

// The hub groups the areas into stacked list sections. Sections keep the menu
// scannable as it grows: a new area is one more row, never another big card.
export const ACCOUNT_SECTIONS = [
  { key: 'you', titleKey: 'account.sectionYou', areaKeys: ['personal', 'passport-awards'] },
  { key: 'app', titleKey: 'account.sectionApp', areaKeys: ['preferences', 'integrations', 'security'] },
];

// Old bookmarks and links that still point at the two areas that were merged.
export const LEGACY_AREA_REDIRECTS = {
  passport: 'passport-awards',
  community: 'passport-awards',
};

export const ACCOUNT_AREA_KEYS = [...ACCOUNT_AREAS.map((area) => area.key), ...Object.keys(LEGACY_AREA_REDIRECTS)];

export const accountAreaPath = (key) => `/account/${key}`;