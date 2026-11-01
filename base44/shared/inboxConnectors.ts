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

export const INBOX_PROVIDERS = ['gmail', 'outlook'];

const MAX_CANDIDATES = 12;
const MAX_INGESTS_PER_SYNC = 6;
const MAX_BODY_CHARS = 20000;
const SCAN_WINDOW_DAYS = 30;
const SYNC_THROTTLE_MS = 10 * 60 * 1000;
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

export async function syncInboxConnection(base44, connection) {
  const provider = connection.provider;
  const accessToken = await ensureAccessToken(base44, connection);

  const parsedCursor = Date.parse(connection.sync_cursor || '');
  const sinceMs = Number.isFinite(parsedCursor) ? parsedCursor : 0;

  const messages = provider === 'gmail'
    ? await fetchGmailMessages(accessToken, { limit: MAX_CANDIDATES, sinceMs })
    : await fetchOutlookMessages(accessToken, {
      limit: MAX_CANDIDATES,
      sinceIso: sinceMs > 0 ? new Date(sinceMs).toISOString() : '',
    });

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
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    last_sync_at: now,
    sync_cursor: cursorMs > 0 ? new Date(cursorMs).toISOString() : (connection.sync_cursor || ''),
    status: 'connected',
    last_error: '',
    updated_at: now,
  });

  return {
    provider,
    scanned: messages.length,
    candidates: candidates.length,
    ingested,
    duplicates,
  };
}

async function markSyncFailure(base44, connection, message) {
  try {
    await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
      status: 'attention',
      last_error: message || 'Sync failed',
      updated_at: new Date().toISOString(),
    });
  } catch {
    // Recording the failure must never mask the original error.
  }
}

export async function listUserConnections(base44, user) {
  const rows = await base44.asServiceRole.entities.InboxConnection.filter({ target_user_id: user.id });
  return rows || [];
}

export function sanitizeConnection(connection) {
  return {
    id: connection.id,
    provider: connection.provider,
    status: connection.status || 'disconnected',
    provider_account_email: connection.provider_account_email || '',
    connected_at: connection.connected_at || '',
    last_sync_at: connection.last_sync_at || '',
    last_error: connection.last_error || '',
  };
}

export async function upsertConnection(base44, { provider, user, tokens, providerAccountEmail }) {
  const now = new Date().toISOString();
  const existing = await base44.asServiceRole.entities.InboxConnection.filter({
    target_user_id: user.id,
    provider,
  });

  const payload = {
    provider,
    status: 'connected',
    target_user_id: user.id,
    target_user_email: user.email || '',
    target_user_keys: normalizeUserKeys(user.id, user.email || ''),
    provider_account_email: providerAccountEmail || '',
    access_token: tokens.accessToken || '',
    refresh_token: tokens.refreshToken || existing[0]?.refresh_token || '',
    access_token_expires_at: tokens.expiresAt || '',
    connected_at: now,
    last_error: '',
    disabled_at: undefined,
    updated_at: now,
  };

  if (existing[0]) {
    await base44.asServiceRole.entities.InboxConnection.update(existing[0].id, payload);
    return { id: existing[0].id, created: false };
  }

  const created = await base44.asServiceRole.entities.InboxConnection.create({
    ...payload,
    sync_cursor: '',
    last_sync_at: '',
  });
  return { id: created.id, created: true };
}

export async function disconnectingConnection(base44, connection) {
  await base44.asServiceRole.entities.InboxConnection.update(connection.id, {
    status: 'disconnected',
    access_token: '',
    refresh_token: '',
    access_token_expires_at: '',
    sync_cursor: '',
    last_error: '',
    disabled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function syncInboxForUser(base44, user, { provider, force } = {}) {
  const connections = await listUserConnections(base44, user);
  const targets = connections.filter((c) => {
    if (provider && c.provider !== provider) return false;
    if (!c.access_token && !c.refresh_token) return false;
    if (c.status === 'disconnected') return false;
    return true;
  });

  const results = [];
  for (const connection of targets) {
    if (!force) {
      const lastMs = Date.parse(connection.last_sync_at || '');
      if (Number.isFinite(lastMs) && Date.now() - lastMs < SYNC_THROTTLE_MS) {
        results.push({ provider: connection.provider, skipped: true, reason: 'throttled' });
        continue;
      }
    }
    try {
      const result = await syncInboxConnection(base44, connection);
      results.push({ ...result, ok: true });
    } catch (error: any) {
      const message = error?.message || 'Sync failed';
      await markSyncFailure(base44, connection, message);
      results.push({ provider: connection.provider, ok: false, error: message });
    }
  }

  return results;
}

// Called from Home loads. Runs at most one throttled sync per user, off the
// response path, and never surfaces a failure to the caller.
export async function maybeSyncInboxInBackground(base44, user) {
  try {
    const connections = await listUserConnections(base44, user);
    const due = connections.find((c) => {
      if (c.status !== 'connected' && c.status !== 'attention') return false;
      if (!c.access_token && !c.refresh_token) return false;
      const lastMs = Date.parse(c.last_sync_at || '');
      return !Number.isFinite(lastMs) || Date.now() - lastMs >= SYNC_THROTTLE_MS;
    });
    if (!due) return;
    await syncInboxConnection(base44, due);
  } catch (error: any) {
    // Background sync must stay silent; a real problem is recorded on the
    // connection by the explicit sync path and shown in Account settings.
    if (error?.message && error.message !== 'not_configured') {
      // no-op: intentionally swallowed
    }
  }
}

export async function fetchProviderAccountEmail(provider, accessToken) {
  return fetchAccountEmail(provider, accessToken);
}