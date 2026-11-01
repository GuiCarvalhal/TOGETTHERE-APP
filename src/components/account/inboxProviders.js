// Provider catalog shared by the Account inbox section. `auth` decides how a
// new mailbox of that provider is added: OAuth redirect (gmail/outlook) or an
// app-password sheet (icloud/yahoo).
export const INBOX_PROVIDERS = [
  { provider: 'gmail', labelKey: 'account.inboxGmail', auth: 'oauth' },
  { provider: 'outlook', labelKey: 'account.inboxOutlook', auth: 'oauth' },
  { provider: 'icloud', labelKey: 'account.inboxIcloud', auth: 'credential' },
  { provider: 'yahoo', labelKey: 'account.inboxYahoo', auth: 'credential' },
];

// Fallback cadences; the server's getInboxConnections.sync_intervals is
// authoritative and replaces these once loaded.
export const DEFAULT_INBOX_INTERVALS = [5, 15, 30, 60];