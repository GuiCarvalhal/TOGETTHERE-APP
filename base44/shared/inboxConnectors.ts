// Native inbox connectors (Gmail + Outlook.com).
//
// Everything provider-specific lives here: OAuth URL generation, code exchange,
// token refresh, message fetching and the sync loop. The sync loop does no
// parsing of its own — it hands each candidate message to the SAME shared
// ingestion pipeline used by receiveReservationEmail, so an imported message
// lands identically whichever door it came through.
//
// Secrets are read server-side only (process.env), never returned to the client.

import { extractPlainTextFromHtml, normalizeUserKeys } from './reservationImport.ts';
import { ingestReservationMessage } from './reservationIngestion.ts';
import {
  decryptImapCredential,
  describeImapSyncError,
  fetchImapMessages,
  imapCredentialsAvailable,
  isImapProvider,
} from './imapInbox.ts';

export const INBOX_PROVIDERS = ['gmail', 'outlook', 'icloud', 'yahoo'];

const MAX_CANDIDATES = 12;
const MAX_INGESTS_PER_SYNC = 6;
const MAX_BODY_CHARS = 20000;
const SCAN_WINDOW_DAYS = 30;
// Allowed background cadences, in minutes. Manual "Sync now" ignores them.
export const SYNC_INTERVALS = [5, 15, 30, 60];
export const DEFAULT_SYNC_INTERVAL_MINUTES = 30;
// A sync that started this recently still owns the mailbox; overlapping jobs
// (two Home loads, Home + Sync now) skip it instead of paying for it twice.
const SYNC_LEASE_MS = 2 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const HTTP_TIMEOUT_MS = 20000;

// EN + PT hints that a message is about a booking. Deliberately broad — the
// LLM extraction decides whether a candidate is really a reservation, so a
// false positive only costs one cheap call, while a false negative loses a
// booking.
const RESERVATION_HINTS = [
  'reservation', 'reserva', 'reservas', 'booking', 'itinerary', 'itinerario',
  'itinerary', 'hotel', 'flight', 'voo', 'voos', 'passagem', 'passagens',
  'hospedagem', 'hospedaria', 'confirmation', 'confirmed', 'confirmada',
  'confirmado', 'confirmacao', 'check-in', 'checkin', 'check out',
  'airbnb', 'expedia', 'booking.com', 'boarding', 'embarque', 'cruise',
  'cruzeiro', 'rental', 'aluguel', 'voucher', 'reservation confirmed',
];

// Single-token subset used inside a Gmail search query (multi-word hints would
// be parsed as separate terms there).
const GMAIL_QUERY_HINTS = [
  'reservation', 'reserva', 'booking', 'itinerary', 'itinerario', 'hotel',
  'flight', 'voo', 'passagem', 'hospedagem', 'confirmation', 'confirmed',
  'confirmada', 'airbnb', 'expedia', 'boarding', 'embarque', 'cruise',
  'cruzeiro', 'voucher',
];

function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function isInboxProvider(value) {
  return INBOX_PROVIDERS.includes(value);
}

export function isReservationCandidate(subject, preview) {
  const haystack = stripAccents(`${subject || ''} ${preview || ''}`.toLowerCase());
  if (!haystack.trim()) return false;
  return RESERVATION_HINTS.some((hint) => haystack.includes(hint));
}

// ---------------------------------------------------------------------------
// Accounts + cadence
//
// A user can hold several mailboxes per provider: identity is (user, provider,
// address), never just (user, provider). `account_key` makes that explicit and
// stable so reconnecting the same mailbox updates its row instead of adding a
// duplicate. Legacy rows have no key and are healed on the next connect.
// ---------------------------------------------------------------------------

export function normalizeSyncInterval(value) {
  const minutes = Number(value);
  return SYNC_INTERVALS.includes(minutes) ? minutes : DEFAULT_SYNC_INTERVAL_MINUTES;
}

export function connectionAccountKey(provider, email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized ? `${provider}:${normalized}` : provider;
}

export function connectionLabel(connection) {
  return connection.display_label || connection.provider_account_email || '';
}

// Earliest instant this mailbox may sync again in the background. Cadence is
// measured from the last ATTEMPT (not the last success) so a mailbox that keeps
// failing is not retried on every page load.
export function connectionDueMs(connection) {
  const intervalMs = normalizeSyncInterval(connection.sync_interval_minutes) * 60 * 1000;
  const lastAttemptMs = Date.parse(connection.last_attempt_at || connection.last_sync_at || '');
  return Number.isFinite(lastAttemptMs) ? lastAttemptMs + intervalMs : 0;
}

export function isConnectionDue(connection, now = Date.now()) {
  return now >= connectionDueMs(connection);
}

export function isConnectionInFlight(connection, now = Date.now()) {
  const startedMs = Date.parse(connection.sync_started_at || '');
  return Number.isFinite(startedMs) && now - startedMs < SYNC_LEASE_MS;
}

// ---------------------------------------------------------------------------
// OAuth configuration
// ---------------------------------------------------------------------------

function getOAuthConfig(provider) {
  if (provider === 'gmail') {
    const clientId = (process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  if (provider === 'outlook') {
    const clientId = (process.env.MICROSOFT_OAUTH_CLIENT_ID || '').trim();
    const clientSecret = (process.env.MICROSOFT_OAUTH_CLIENT_SECRET || '').trim();
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  }
  return null;
}

export function inboxProviderConfigStatus() {
  return {
    gmail: Boolean(getOAuthConfig('gmail')),
    outlook: Boolean(getOAuthConfig('outlook')),
    // IMAP providers need no app-level client; they only need the credential
    // encryption key, and each user supplies their own app password.
    icloud: imapCredentialsAvailable(),
    yahoo: imapCredentialsAvailable(),
  };
}

function appOrigin(req) {
  const header = (req.headers.get('x-base44-app-url') || '').trim();
  if (header) return header.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

export function resolveCallbackUrl(req) {
  const configured = (process.env.INBOX_OAUTH_CALLBACK_URL || '').trim();
  if (configured) return configured;
  return `${appOrigin(req)}/functions/completeInboxOAuth`;
}

export function resolveSuccessUrl(req, params = {}) {
  const configured = (process.env.INBOX_OAUTH_SUCCESS_URL || '').trim();
  const base = configured || `${appOrigin(req)}/account`;
  try {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, String(value));
    }
    return url.toString();
  } catch {
    return base;
  }
}

export function buildAuthorizationUrl(provider, { state, redirectUri }) {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error('not_configured');

  const params = new URLSearchParams();
  params.set('client_id', config.clientId);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('state', state);

  if (provider === 'gmail') {
    params.set('scope', 'openid email https://www.googleapis.com/auth/gmail.readonly');
    params.set('access_type', 'offline');
    params.set('prompt', 'consent');
    params.set('include_granted_scopes', 'true');
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  params.set('scope', 'offline_access openid email User.Read Mail.Read');
  params.set('response_mode', 'query');
  params.set('prompt', 'consent');
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token handling
// ---------------------------------------------------------------------------

async function requestToken(provider, body) {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error('not_configured');

  const endpoint = provider === 'gmail'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

  const params = new URLSearchParams({
    ...body,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error_description || json?.error || `Token request failed (${res.status})`);
  }
  return json;
}

function expiresAtFrom(expiresIn) {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export async function exchangeAuthorizationCode(provider, { code, redirectUri }) {
  const json = await requestToken(provider, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  return {
    accessToken: json.access_token || '',
    refreshToken: json.refresh_token || '',
    expiresAt: expiresAtFrom(json.expires_in),
  };
}

async function ensureAccessToken(base44, connection) {
  const expiresMs = Date.parse(connection.access_token_expires_at || '');
  const stillValid = connection.access_token &&
    (!Number.isFinite(expiresMs) || expiresMs - Date.now() > TOKEN_REFRESH_SKEW_MS);
  if (stillValid) return connection.access_token;

  if (!connection.refresh_token) throw new Error('Reconnect required: no refresh token was stored.');

  const json = await requestToken(connection.provider, {
    grant_type: 'refresh_token',
    refresh_token: connection.refresh_token,
  });

  const accessToken = json.access_token || '';
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    access_token: accessToken,
    refresh_token: json.refresh_token || connection.refresh_token,
    access_token_expires_at: expiresAtFrom(json.expires_in),
    updated_at: new Date().toISOString(),
  });
  return accessToken;
}

async function fetchAccountEmail(provider, accessToken) {
  try {
    if (provider === 'gmail') {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      if (!res.ok) return '';
      const json = await res.json().catch(() => ({}));
      return json.emailAddress || '';
    }
    const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) return '';
    const json = await res.json().catch(() => ({}));
    return json.mail || json.userPrincipalName || '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Provider reads
// ---------------------------------------------------------------------------

function decodeBase64Url(data) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

function collectGmailParts(part, plain, html) {
  if (!part) return;
  const mimeType = part.mimeType || '';
  const data = part.body?.data;
  if (data) {
    const decoded = decodeBase64Url(data);
    if (mimeType === 'text/plain') plain.push(decoded);
    else if (mimeType === 'text/html') html.push(decoded);
  }
  for (const child of part.parts || []) collectGmailParts(child, plain, html);
}

function headerValue(headers, name) {
  const target = name.toLowerCase();
  const hit = (headers || []).find((h) => String(h?.name || '').toLowerCase() === target);
  return hit?.value || '';
}

async function fetchGmailMessages(accessToken, { limit, sinceMs }) {
  const windowClause = sinceMs > 0
    ? `after:${Math.floor(sinceMs / 1000)}`
    : `newer_than:${SCAN_WINDOW_DAYS}d`;
  const query = `in:inbox ${windowClause} (${GMAIL_QUERY_HINTS.join(' OR ')})`;

  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&q=${encodeURIComponent(query)}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status})`);
  const listJson = await listRes.json().catch(() => ({}));
  const ids = (listJson.messages || []).map((m) => m.id).filter(Boolean);

  const messages = await Promise.allSettled(ids.map(async (id) => {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Gmail message failed (${res.status})`);
    const json = await res.json().catch(() => ({}));
    const headers = json?.payload?.headers || [];
    const plain = [];
    const html = [];
    collectGmailParts(json?.payload, plain, html);
    const text = plain.join('\n').trim() ||
      (html.length ? extractPlainTextFromHtml(html.join('\n')) : '') ||
      json.snippet || '';
    const internalMs = Number(json.internalDate) || 0;
    return {
      sourceId: `gmail:${id}`,
      subject: headerValue(headers, 'Subject'),
      sender: headerValue(headers, 'From'),
      recipient: headerValue(headers, 'To'),
      receivedAt: headerValue(headers, 'Date') || (internalMs ? new Date(internalMs).toISOString() : ''),
      receivedMs: internalMs,
      text: text.slice(0, MAX_BODY_CHARS),
    };
  }));

  return messages
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value);
}

async function fetchOutlookMessages(accessToken, { limit, sinceIso }) {
  const params = new URLSearchParams({
    $top: String(limit),
    $select: 'id,subject,bodyPreview,body,from,toRecipients,receivedDateTime,internetMessageId',
    $orderby: 'receivedDateTime desc',
  });
  if (sinceIso) params.set('$filter', `receivedDateTime ge ${sinceIso}`);

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/messages?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Outlook list failed (${res.status})`);
  const json = await res.json().catch(() => ({}));

  return (json.value || []).map((m) => {
    const bodyContent = m?.body?.content || '';
    const text = m?.body?.contentType === 'html'
      ? extractPlainTextFromHtml(bodyContent)
      : (bodyContent || m?.bodyPreview || '');
    return {
      sourceId: `outlook:${m.id}`,
      subject: m.subject || '',
      sender: m?.from?.emailAddress?.address || '',
      recipient: (m.toRecipients || []).map((r) => r?.emailAddress?.address).filter(Boolean).join(', '),
      receivedAt: m.receivedDateTime || '',
      receivedMs: Date.parse(m.receivedDateTime || '') || 0,
      text: text.slice(0, MAX_BODY_CHARS),
    };
  });
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

// Provider-agnostic fetch. Gmail/Outlook go through OAuth tokens; iCloud/Yahoo
// read IMAP with the stored app password. Everything after this is identical
// for all four providers.
async function collectMessages(base44, connection, { sinceMs }) {
  const provider = connection.provider;

  if (isImapProvider(provider)) {
    const appPassword = await decryptImapCredential(connection.credential_secret);
    if (!appPassword) throw new Error('missing_password');
    const { messages, nextUidCursor } = await fetchImapMessages(provider, {
      email: connection.provider_account_email || '',
      appPassword,
      limit: MAX_CANDIDATES,
      sinceMs,
      uidCursor: Number(connection.uid_cursor) || 0,
      isCandidate: (subject) => isReservationCandidate(subject, ''),
    });
    return { messages, cursorPatch: nextUidCursor > 0 ? { uid_cursor: nextUidCursor } : {} };
  }

  const accessToken = await ensureAccessToken(base44, connection);
  const messages = provider === 'gmail'
    ? await fetchGmailMessages(accessToken, { limit: MAX_CANDIDATES, sinceMs })
    : await fetchOutlookMessages(accessToken, {
      limit: MAX_CANDIDATES,
      sinceIso: sinceMs > 0 ? new Date(sinceMs).toISOString() : '',
    });
  return { messages, cursorPatch: {} };
}

export async function syncInboxConnection(base44, connection) {
  const provider = connection.provider;

  const parsedCursor = Date.parse(connection.sync_cursor || '');
  const sinceMs = Number.isFinite(parsedCursor) ? parsedCursor : 0;

  const { messages, cursorPatch } = await collectMessages(base44, connection, { sinceMs });

  const candidates = messages
    .filter((m) => isReservationCandidate(m.subject, m.text.slice(0, 800)))
    .sort((a, b) => b.receivedMs - a.receivedMs);

  let ingested = 0;
  let duplicates = 0;
  let cursorMs = sinceMs;
  let stoppedEarly = false;

  for (const message of candidates) {
    if (ingested >= MAX_INGESTS_PER_SYNC) {
      stoppedEarly = true;
      break;
    }
    const result = await ingestReservationMessage(base44, {
      messageId: message.sourceId,
      subject: message.subject,
      sender: message.sender,
      recipient: message.recipient,
      receivedAt: message.receivedAt,
      text: message.text,
      targetHints: {
        targetUserId: connection.target_user_id,
        targetUserEmail: connection.target_user_email,
      },
    });
    if (result?.reused) duplicates += 1;
    else if (result?.record) ingested += 1;
    // Candidates are newest-first: the last one we handled is the safe floor
    // for the next cursor, so an early stop never skips unread messages.
    cursorMs = message.receivedMs || cursorMs;
  }

  if (!stoppedEarly) {
    const newestScanned = messages.reduce((acc, m) => Math.max(acc, m.receivedMs || 0), cursorMs);
    cursorMs = Math.max(cursorMs, newestScanned);
  }

  const now = new Date().toISOString();
  const intervalMs = normalizeSyncInterval(connection.sync_interval_minutes) * 60 * 1000;
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    last_sync_at: now,
    last_attempt_at: now,
    next_sync_at: new Date(Date.parse(now) + intervalMs).toISOString(),
    sync_started_at: '',
    sync_cursor: cursorMs > 0 ? new Date(cursorMs).toISOString() : (connection.sync_cursor || ''),
    status: 'connected',
    last_error: '',
    updated_at: now,
    ...cursorPatch,
  });

  return {
    provider,
    scanned: messages.length,
    candidates: candidates.length,
    ingested,
    duplicates,
  };
}

// Provider-aware, user-facing message for a failed sync. IMAP errors get a
// readable explanation; OAuth errors keep the provider's own wording.
export function describeSyncError(connection, error) {
  const raw = error?.message || 'Sync failed';
  return isImapProvider(connection.provider)
    ? describeImapSyncError(connection.provider, raw)
    : raw;
}

async function markSyncFailure(base44, connection, message) {
  try {
    const now = Date.now();
    const intervalMs = normalizeSyncInterval(connection.sync_interval_minutes) * 60 * 1000;
    await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
      status: 'attention',
      last_error: message || 'Sync failed',
      // A failure still consumes the cadence window, otherwise a broken token
      // would be retried on every page load.
      last_attempt_at: new Date(now).toISOString(),
      next_sync_at: new Date(now + intervalMs).toISOString(),
      sync_started_at: '',
      updated_at: new Date(now).toISOString(),
    });
  } catch {
    // Recording the failure must never mask the original error.
  }
}

export async function listUserConnections(base44, user) {
  const rows = await base44.asServiceRole.entities.InboxConnection.filter({ target_user_id: user.id });
  return rows || [];
}

// Client-safe projection. Never includes tokens or the encrypted app password.
export function sanitizeConnection(connection) {
  const interval = normalizeSyncInterval(connection.sync_interval_minutes);
  const dueMs = connectionDueMs(connection);
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status || 'disconnected',
    account_key: connection.account_key || connectionAccountKey(connection.provider, connection.provider_account_email),
    provider_account_email: connection.provider_account_email || '',
    display_label: connectionLabel(connection),
    sync_interval_minutes: interval,
    next_sync_at: connection.next_sync_at || (dueMs > 0 ? new Date(dueMs).toISOString() : ''),
    last_attempt_at: connection.last_attempt_at || '',
    connected_at: connection.connected_at || '',
    last_sync_at: connection.last_sync_at || '',
    last_error: connection.last_error || '',
    in_flight: isConnectionInFlight(connection),
  };
}

// Finds the row representing ONE mailbox (provider + address). A legacy row that
// predates account_key is matched by its address and healed in place, so
// existing single-account users keep their tokens, cursors and import history.
export async function findAccountConnection(base44, { userId, provider, email }) {
  const targetEmail = String(email || '').trim().toLowerCase();
  const rows = await base44.asServiceRole.entities.InboxConnection.filter({
    target_user_id: userId,
    provider,
  });
  const all = rows || [];
  const targetKey = connectionAccountKey(provider, targetEmail);

  const keyed = all.find((c) => c.account_key === targetKey);
  if (keyed) return keyed;

  const legacy = all.find((c) => {
    if (c.account_key) return false;
    const rowEmail = String(c.provider_account_email || '').trim().toLowerCase();
    return targetEmail ? rowEmail === targetEmail : !rowEmail;
  });
  return legacy || null;
}

export async function upsertConnection(base44, { provider, user, tokens, providerAccountEmail }) {
  const now = new Date().toISOString();
  const accountEmail = String(providerAccountEmail || '').trim();
  const existing = await findAccountConnection(base44, { userId: user.id, provider, email: accountEmail });

  const payload = {
    provider,
    status: 'connected',
    target_user_id: user.id,
    target_user_email: user.email || '',
    target_user_keys: normalizeUserKeys(user.id, user.email || ''),
    // Two accounts of the same provider coexist; the same account reconnects.
    account_key: connectionAccountKey(provider, accountEmail),
    display_label: existing?.display_label || accountEmail,
    provider_account_email: accountEmail,
    access_token: tokens.accessToken || '',
    refresh_token: tokens.refreshToken || existing?.refresh_token || '',
    access_token_expires_at: tokens.expiresAt || '',
    connected_at: now,
    last_error: '',
    sync_started_at: '',
    disabled_at: undefined,
    updated_at: now,
  };

  if (existing) {
    await base44.asServiceRole.entities.InboxConnection.update(existing.id, payload);
    return { id: existing.id, created: false };
  }

  const created = await base44.asServiceRole.entities.InboxConnection.create({
    ...payload,
    sync_interval_minutes: DEFAULT_SYNC_INTERVAL_MINUTES,
    sync_cursor: '',
    last_sync_at: '',
    last_attempt_at: '',
    next_sync_at: '',
  });
  return { id: created.id, created: true };
}

export async function disconnectingConnection(base44, connection) {
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    status: 'disconnected',
    access_token: '',
    refresh_token: '',
    access_token_expires_at: '',
    credential_secret: '',
    sync_cursor: '',
    uid_cursor: 0,
    sync_started_at: '',
    next_sync_at: '',
    last_error: '',
    disabled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

function hasCredentials(connection) {
  return Boolean(connection.access_token || connection.refresh_token || connection.credential_secret);
}

// Takes the mailbox for this run. The lease is a short timestamp on the row, so
// two overlapping jobs (Home load + a manual Sync now) cannot both pull the same
// mailbox; whoever loses just reports `in_flight`.
async function claimConnection(base44, connection) {
  if (isConnectionInFlight(connection)) return false;
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    sync_started_at: new Date().toISOString(),
  });
  return true;
}

// Syncs one connection (`connectionId`), every connection of one provider
// (`provider`), or all of the user's mailboxes (neither). `force` = "Sync now":
// it ignores the cadence, never the in-flight lease or the disconnected state.
export async function syncUserConnections(base44, user, { connectionId, provider, force } = {}) {
  const connections = await listUserConnections(base44, user);
  const targets = (connections || []).filter((c) => {
    if (connectionId) return c.id === connectionId;
    if (provider) return c.provider === provider;
    return true;
  });

  if (connectionId && targets.length === 0) throw new Error('connection_not_found');

  const results = [];
  for (const connection of targets) {
    const identity = {
      connection_id: connection.id,
      provider: connection.provider,
      account: connection.provider_account_email || '',
      label: connectionLabel(connection),
    };

    if (!hasCredentials(connection) || connection.status === 'disconnected') {
      results.push({ ...identity, skipped: true, reason: 'disconnected', ingested: 0 });
      continue;
    }
    if (!force && !isConnectionDue(connection)) {
      results.push({
        ...identity,
        skipped: true,
        reason: 'not_due',
        next_sync_at: new Date(connectionDueMs(connection)).toISOString(),
        ingested: 0,
      });
      continue;
    }
    if (!(await claimConnection(base44, connection).catch(() => false))) {
      results.push({ ...identity, skipped: true, reason: 'in_flight', ingested: 0 });
      continue;
    }

    try {
      const result = await syncInboxConnection(base44, connection);
      results.push({ ...identity, ...result, ok: true });
    } catch (error: any) {
      const message = describeSyncError(connection, error);
      await markSyncFailure(base44, connection, message);
      results.push({ ...identity, ok: false, error: message, ingested: 0 });
    }
  }

  return results;
}

// Called from Home loads, off the response path. Picks the most overdue mailbox
// whose own cadence has elapsed, takes its lease, and syncs just that one — so a
// page load never fans out across several mailboxes and never ignores the
// per-account interval. Failures land on the connection row (visible in Account)
// instead of reaching the caller.
export async function maybeSyncInboxInBackground(base44, user) {
  try {
    const connections = await listUserConnections(base44, user);
    const now = Date.now();
    const due = (connections || [])
      .filter((c) => c.status === 'connected' || c.status === 'attention')
      .filter((c) => hasCredentials(c))
      .filter((c) => !isConnectionInFlight(c, now))
      .filter((c) => isConnectionDue(c, now))
      .sort((a, b) => connectionDueMs(a) - connectionDueMs(b))[0];
    if (!due) return;

    if (!(await claimConnection(base44, due).catch(() => false))) return;
    try {
      await syncInboxConnection(base44, due);
    } catch (error: any) {
      await markSyncFailure(base44, due, describeSyncError(due, error));
    }
  } catch {
    // Listing failures are transient and stay silent on a background path.
  }
}

export async function fetchProviderAccountEmail(provider, accessToken) {
  return fetchAccountEmail(provider, accessToken);
}