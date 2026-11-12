import { UserRound, SlidersHorizontal, Plug, ShieldCheck, Trophy } from 'lucide-react';

// The Account areas, in the order the hub lists them. One source of truth
// for the hub cards AND the area pages, so a card always lands on the page that
// shows that area and nothing else.
//   key      → the route segment: /account/<key>
//   titleKey → the card label and the area page title
//   descKey  → the one-line explanation shown on both
export const ACCOUNT_AREAS = [
  { key: 'personal', Icon: UserRound, titleKey: 'account.menuPersonal', descKey: 'account.secPersonalDesc' },
  { key: 'preferences', Icon: SlidersHorizontal, titleKey: 'account.menuPreferences', descKey: 'account.secPreferencesDesc' },
  { key: 'integrations', Icon: Plug, titleKey: 'account.menuIntegrations', descKey: 'account.secIntegrationsDesc' },
  { key: 'community', Icon: Trophy, titleKey: 'account.menuCommunity', descKey: 'account.secCommunityDesc' },
  { key: 'security', Icon: ShieldCheck, titleKey: 'account.menuSecurity', descKey: 'account.secSecurityDesc' },
];

export const ACCOUNT_AREA_KEYS = ACCOUNT_AREAS.map((area) => area.key);

export const accountAreaPath = (key) => `/account/${key}`;