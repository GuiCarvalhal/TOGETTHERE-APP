// Provider catalog shared by the Account inbox section. `auth` decides how a new
// mailbox of that provider is added: an OAuth redirect (gmail / outlook / yahoo)
// or the app-password sheet (icloud, the only credential-based provider).
export const INBOX_PROVIDERS = [
  { provider: 'gmail', labelKey: 'account.inboxGmail', auth: 'oauth' },
  { provider: 'outlook', labelKey: 'account.inboxOutlook', auth: 'oauth' },
  { provider: 'icloud', labelKey: 'account.inboxIcloud', auth: 'credential' },
  { provider: 'yahoo', labelKey: 'account.inboxYahoo', auth: 'oauth', hintKey: 'account.inboxYahooOAuthHint' },
];

// Sync cadences offered in the UI: 1h, 6h, 24h and Weekly, in minutes. The
// server's getInboxConnections.sync_intervals is authoritative and replaces
// these once loaded; both lists must stay identical (see inboxConnectors.ts).
export const DEFAULT_INBOX_INTERVALS = [60, 360, 1440, 10080];

const CADENCE_LABEL_KEYS = {
  60: 'account.cadenceHourly',
  360: 'account.cadence6h',
  1440: 'account.cadence24h',
  10080: 'account.cadenceWeekly',
};

export function normalizeCadence(minutes) {
  const value = Number(minutes);
  return DEFAULT_INBOX_INTERVALS.includes(value) ? value : DEFAULT_INBOX_INTERVALS[0];
}

// Human label for a cadence value, so the card and the sheet never disagree.
export function cadenceLabel(minutes, t) {
  return t(CADENCE_LABEL_KEYS[normalizeCadence(minutes)]);
}