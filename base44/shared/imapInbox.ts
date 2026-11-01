// IMAP mailbox connectors: iCloud (app-specific password) and Yahoo (OAuth 2.0
// over SASL XOAUTH2).
//
// Nothing here parses reservations: it only authenticates, reads recent INBOX
// messages and hands them to the SAME shared ingestion pipeline the Gmail and
// Outlook connectors use. An iCloud app password is AES-GCM encrypted at rest
// (tagged with the key that wrote it) and never logged or returned to the client;
// Yahoo stores OAuth tokens only, so no password ever exists for it.

import {
  decodeImapBytes,
  literalsByUid,
  openImap,
  quoteImap,
  searchUids,
} from './imapClient.ts';
import { extractPlainTextFromHtml } from './reservationImport.ts';

export const IMAP_PROVIDERS = ['icloud', 'yahoo'];
// Which credential model a provider uses. Yahoo is OAuth-only: an app password
// is never accepted for it.
export const APP_PASSWORD_PROVIDERS = ['icloud'];
export const IMAP_OAUTH_PROVIDERS = ['yahoo'];

// Official IMAP endpoints, TLS only.
const ENDPOINTS: Record<string, { host: string; port: number }> = {
  icloud: { host: 'imap.mail.me.com', port: 993 },
  yahoo: { host: 'imap.mail.yahoo.com', port: 993 },
};

const CONNECT_TIMEOUT_MS = 15000;
const MAX_BODY_CHARS = 20000;
const SCAN_WINDOW_DAYS = 30;
const BODY_FETCH_LIMIT = 8;
const FALLBACK_BODY_FETCH = 5;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function isImapProvider(value: unknown) {
  return typeof value === 'string' && IMAP_PROVIDERS.includes(value);
}

export function isAppPasswordProvider(value: unknown) {
  return typeof value === 'string' && APP_PASSWORD_PROVIDERS.includes(value);
}

export function isImapOAuthProvider(value: unknown) {
  return typeof value === 'string' && IMAP_OAUTH_PROVIDERS.includes(value);
}

export function imapEndpoint(provider: string) {
  return ENDPOINTS[provider] || null;
}

// ---------------------------------------------------------------------------
// Credential encryption (AES-GCM)
//
// The dedicated key is INBOX_CREDENTIALS_KEY and it is what new writes use.
// Ciphertext is tagged with a short fingerprint of the key that produced it
// (`v2:<keyId>:<iv>:<ciphertext>`), so a rotated key is DETECTED instead of
// silently yielding garbage: the outgoing key stays readable through
// INBOX_CREDENTIALS_KEY_PREVIOUS during the rotation window, and anything read
// with a non-primary key is re-encrypted on the next sync. Records written before
// fingerprints existed (`v1:`) are tried against the whole ring.
// RESERVATION_INBOX_TOKEN is last-resort legacy material — read for compatibility,
// never preferred when a dedicated key exists.
// ---------------------------------------------------------------------------

function keyMaterials(): string[] {
  return [
    (process.env.INBOX_CREDENTIALS_KEY || '').trim(),
    (process.env.INBOX_CREDENTIALS_KEY_PREVIOUS || '').trim(),
    (process.env.RESERVATION_INBOX_TOKEN || '').trim(),
  ].filter(Boolean);
}

// The connectors are usable as soon as some key material exists; the UI reads
// this to decide whether to offer Connect at all.
export function imapCredentialsAvailable() {
  return keyMaterials().length > 0;
}

type CredentialKey = { id: string; key: CryptoKey };

function keyFingerprint(digest: ArrayBuffer) {
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveKey(material: string): Promise<CredentialKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  const key = await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { id: keyFingerprint(digest), key };
}

// Ordered ring: dedicated key first, then the previous one, then the legacy token.
async function credentialKeyring(): Promise<CredentialKey[]> {
  const seen = new Set<string>();
  const materials = keyMaterials().filter((material) => {
    if (seen.has(material)) return false;
    seen.add(material);
    return true;
  });
  const keys: CredentialKey[] = [];
  for (const material of materials) keys.push(await deriveKey(material));
  return keys;
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function primaryKey(): Promise<CredentialKey> {
  const [first] = await credentialKeyring();
  if (!first) throw new Error('credentials_key_missing');
  return first;
}

export async function encryptImapCredential(plain: string) {
  const { id, key } = await primaryKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `v2:${id}:${toBase64(iv)}:${toBase64(new Uint8Array(cipher))}`;
}

export type StoredCredential = {
  value: string;
  // True when the record was written with a key that is no longer primary (old
  // dedicated key, legacy token, or a pre-fingerprint v1 record). The caller can
  // re-encrypt with the primary key to complete a rotation.
  needsRotation: boolean;
};

// Decrypts a stored app password. Throws a specific code — never server detail —
// when the key material is missing or no longer matches the stored ciphertext.
export async function readImapCredential(stored: unknown): Promise<StoredCredential> {
  const raw = typeof stored === 'string' ? stored.trim() : '';
  if (!raw) return { value: '', needsRotation: false };

  const parts = raw.split(':');
  const tagged = parts[0] === 'v2' && parts.length === 4;
  const legacy = parts[0] === 'v1' && parts.length === 3;
  if (!tagged && !legacy) return { value: '', needsRotation: false };

  const storedKeyId = tagged ? parts[1] : '';
  const ivPart = tagged ? parts[2] : parts[1];
  const dataPart = tagged ? parts[3] : parts[2];

  const ring = await credentialKeyring();
  if (!ring.length) throw new Error('credentials_key_missing');

  const primaryId = ring[0].id;
  // A tagged record is only meaningful to the key that produced it; an untagged
  // (v1) record predates fingerprints, so every configured key is a candidate.
  const candidates = storedKeyId ? ring.filter((candidate) => candidate.id === storedKeyId) : ring;
  if (!candidates.length) throw new Error('credentials_key_invalid');

  for (const candidate of candidates) {
    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromBase64(ivPart) },
        candidate.key,
        fromBase64(dataPart),
      );
      return {
        value: new TextDecoder().decode(plain),
        needsRotation: candidate.id !== primaryId,
      };
    } catch {
      // Wrong key in the ring — try the next one.
    }
  }
  throw new Error('credentials_key_invalid');
}

// ---------------------------------------------------------------------------
// Error mapping — the UI translates these codes per provider
// ---------------------------------------------------------------------------

export function imapErrorCode(error: any) {
  const raw = String(error?.message || error || '').toLowerCase();
  if (!raw) return 'imap_error';
  if (raw.includes('credentials_key_missing')) return 'credentials_key_missing';
  if (raw.includes('credentials_key_invalid')) return 'credentials_key_invalid';
  if (raw.includes('missing_password') || raw.includes('app_password_missing')) return 'missing_password';
  if (raw.includes('missing_token')) return 'missing_token';
  if (raw.includes('timeout') || raw.includes('timed out')) return 'timeout';
  if (raw.includes('reconnect') || raw.includes('invalid_grant') || raw.includes('unauthorized')) return 'auth_failed';
  if (raw.includes('auth')) return 'auth_failed';
  if (raw.includes('denied') || raw.includes('not permitted') || raw.includes('forbidden')) return 'denied';
  if (raw.includes('imap_unavailable') || raw.includes('not_configured')) return 'unavailable';
  return 'imap_error';
}

// Short, storage-safe explanation written to InboxConnection.last_error. Provider
// or server wording is never echoed back — only these fixed codes reach the UI.
export function describeImapSyncError(provider: string, message: string) {
  const code = imapErrorCode(message);
  const label = provider === 'yahoo' ? 'Yahoo' : 'iCloud';
  const oauth = isImapOAuthProvider(provider);

  switch (code) {
    case 'credentials_key_missing':
      return 'Mailbox security is not configured yet. Ask the app owner to set the inbox credentials key.';
    case 'credentials_key_invalid':
      return 'Stored mailbox credentials can no longer be read because the inbox key changed. Reconnect the mailbox.';
    case 'auth_failed':
      return oauth
        ? `${label} authorization expired. Reconnect the mailbox to approve mail access again.`
        : `${label} rejected the app password. Reconnect with a new app password.`;
    case 'denied':
      return oauth
        ? `${label} denied mailbox access. Reconnect and allow mail reading.`
        : `${label} denied mailbox access. Check that IMAP is enabled for the account.`;
    case 'timeout':
      return `${label} did not answer in time. Try syncing again.`;
    case 'missing_password':
    case 'missing_token':
      return 'No mailbox credential is stored. Reconnect the mailbox.';
    case 'unavailable':
      return 'Mailbox credentials are not configured yet.';
    default:
      return `${label} sync failed. Try again.`;
  }
}

// ---------------------------------------------------------------------------
// IMAP reads
// ---------------------------------------------------------------------------

function imapDate(ms: number) {
  const date = Number.isFinite(ms) && ms > 0
    ? new Date(ms)
    : new Date(Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  return `${day}-${month}-${date.getUTCFullYear()}`;
}

function parseInternalDate(value: string) {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})/.exec(String(value || '').trim());
  if (!match) return 0;
  const [, day, monthName, year, hours, minutes, seconds, zone] = match;
  const monthIndex = MONTHS.indexOf(monthName.toLowerCase());
  if (monthIndex < 0) return 0;
  const sign = zone.startsWith('-') ? -1 : 1;
  const offsetMinutes = sign * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(3, 5)));
  const utc = Date.UTC(Number(year), monthIndex, Number(day), Number(hours), Number(minutes), Number(seconds));
  return utc - offsetMinutes * 60000;
}

function parseHeaders(block: string) {
  const map: Record<string, string> = {};
  const unfolded = String(block || '').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    map[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return map;
}

function splitHeaders(raw: string) {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { headers: parseHeaders(raw), body: '' };
  return {
    headers: parseHeaders(raw.slice(0, match.index)),
    body: raw.slice(match.index + match[0].length),
  };
}

function headerParam(value: string, name: string) {
  const match = String(value || '').match(new RegExp(`${name}\\s*=\\s*"?([^";]+)"?`, 'i'));
  return match ? match[1].trim() : '';
}

function quotedPrintableToBytes(input: string) {
  const source = String(input || '').replace(/=\r?\n/g, '');
  const out: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const head = source.slice(i + 1, i + 3);
    if (source[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(head)) {
      out.push(parseInt(head, 16));
      i += 2;
    } else {
      out.push(source.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function base64ToBytes(input: string) {
  const clean = String(input || '').replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return new Uint8Array(0);
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeTransfer(body: string, encoding: string) {
  const value = String(encoding || '').toLowerCase();
  try {
    if (value.includes('base64')) return decodeImapBytes(base64ToBytes(body));
    if (value.includes('quoted-printable')) return decodeImapBytes(quotedPrintableToBytes(body));
    return body;
  } catch {
    return body;
  }
}

function collectTextParts(raw: string, out: { plain: string[]; html: string[] }, depth = 0) {
  if (depth > 6) return;
  const { headers, body } = splitHeaders(raw);
  const contentType = headers['content-type'] || 'text/plain';
  const boundary = headerParam(contentType, 'boundary');

  if (/^multipart\//i.test(contentType) && boundary) {
    const marker = `--${boundary}`;
    let position = body.indexOf(marker);
    while (position >= 0) {
      const next = body.indexOf(marker, position + marker.length);
      if (next < 0) break;
      const chunk = body.slice(position + marker.length, next).replace(/^\r?\n/, '');
      if (!chunk.startsWith('--')) collectTextParts(chunk, out, depth + 1);
      position = next;
    }
    return;
  }

  const text = decodeTransfer(body, headers['content-transfer-encoding'] || '');
  if (/^text\/html/i.test(contentType)) out.html.push(text);
  else if (/^text\/plain/i.test(contentType)) out.plain.push(text);
}

export function decodeMimeWords(value: string) {
  return String(value || '')
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_all, charset, encoding, data) => {
      try {
        const bytes = String(encoding).toUpperCase() === 'B'
          ? base64ToBytes(data)
          : quotedPrintableToBytes(String(data).replace(/_/g, ' '));
        return new TextDecoder(String(charset || 'utf-8')).decode(bytes);
      } catch {
        return data;
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMessageText(raw: string) {
  const out = { plain: [] as string[], html: [] as string[] };
  collectTextParts(raw, out);
  const plain = out.plain.join('\n').trim();
  if (plain) return plain;
  if (out.html.length) return extractPlainTextFromHtml(out.html.join('\n'));
  return '';
}

function loginFailure(result: any) {
  const text = (result?.parts || [])
    .map((part: any) => (typeof part?.line === 'string' ? part.line : ''))
    .join(' ')
    .toLowerCase();
  if (text.includes('unavailable') || text.includes('try again') || text.includes('server error')) return 'imap_error';
  return 'auth_failed';
}

// Yahoo requires a client identifier command before it serves a session.
async function sendClientId(session: any) {
  try {
    await session.run('ID ("name" "TOGETTHERE" "version" "1.0")');
  } catch {
    // Optional: some accounts answer BAD and still work.
  }
}

// SASL XOAUTH2 payload: user=<address>\x01auth=Bearer <token>\x01\x01
export function buildXoauth2Payload(email: string, accessToken: string) {
  return toBase64(new TextEncoder().encode(`user=${email}\x01auth=Bearer ${accessToken}\x01\x01`));
}

async function openImapSession(provider: string, { email, appPassword, accessToken }: any) {
  const endpoint = imapEndpoint(provider);
  if (!endpoint) throw new Error('unknown_provider');
  if (!email) throw new Error('missing_password');
  if (!appPassword && !accessToken) {
    throw new Error(isImapOAuthProvider(provider) ? 'missing_token' : 'missing_password');
  }

  const session = await openImap(endpoint, { timeoutMs: CONNECT_TIMEOUT_MS });
  try {
    if (accessToken) {
      await sendClientId(session);
      const auth = await session.authenticateSasl('XOAUTH2', buildXoauth2Payload(email, accessToken));
      if (auth.status !== 'OK') throw new Error(loginFailure(auth));
    } else {
      const login = await session.run(`LOGIN ${quoteImap(email)} ${quoteImap(appPassword)}`);
      if (login.status !== 'OK') throw new Error(loginFailure(login));
    }

    const select = await session.run('SELECT "INBOX"');
    if (select.status !== 'OK') throw new Error('denied');
    return session;
  } catch (error) {
    await session.close();
    throw error;
  }
}

// Verifies an app password without storing anything. Throws on failure so the
// caller can map the error to a provider-specific message.
export async function testImapLogin(provider: string, { email, appPassword }: any) {
  const session = await openImapSession(provider, { email, appPassword });
  await session.close();
  return { ok: true };
}

export async function fetchImapMessages(provider: string, opts: any) {
  const { email, appPassword, accessToken, limit, sinceMs, uidCursor, isCandidate } = opts || {};
  const session = await openImapSession(provider, { email, appPassword, accessToken });

  try {
    // UID cursor when we have one (strictly newer), otherwise a time window.
    const searchCommand = uidCursor > 0
      ? `UID SEARCH UID ${Number(uidCursor) + 1}:*`
      : `UID SEARCH SINCE ${imapDate(sinceMs)}`;
    const search = await session.run(searchCommand);
    if (search.status !== 'OK') throw new Error('search_failed');

    let uids = searchUids(search);
    if (uidCursor > 0) uids = uids.filter((uid) => uid > Number(uidCursor));
    uids = [...new Set(uids)].sort((a, b) => a - b);

    const nextUidCursor = uids.length ? uids[uids.length - 1] : (Number(uidCursor) || 0);
    if (!uids.length) return { messages: [], nextUidCursor };

    const window = uids.slice(-Math.max(1, Number(limit) || 12));

    const headerResult = await session.run(
      `UID FETCH ${window.join(',')} (UID INTERNALDATE BODY.PEEK[HEADER.FIELDS (SUBJECT FROM TO DATE)])`,
    );
    const headerLiterals = literalsByUid(headerResult);

    const rows = [];
    for (const uid of window) {
      const entry = headerLiterals.get(uid);
      if (!entry) continue;
      const headers = parseHeaders(decodeImapBytes(entry.bytes));
      const receivedMs = parseInternalDate(entry.internalDate) || Date.parse(headers.date || '') || 0;
      rows.push({
        uid,
        subject: decodeMimeWords(headers.subject || ''),
        sender: decodeMimeWords(headers.from || ''),
        recipient: decodeMimeWords(headers.to || ''),
        receivedMs,
      });
    }

    // Only download full bodies where the subject already looks like a booking;
    // if nothing matches, sample the newest few anyway so an oddly-worded
    // subject cannot hide a real reservation.
    const matched = rows.filter((row) => {
      try {
        return typeof isCandidate === 'function' ? Boolean(isCandidate(row.subject)) : true;
      } catch {
        return true;
      }
    });
    const bodyTargets = (matched.length ? matched.map((row) => row.uid) : window.slice(-FALLBACK_BODY_FETCH))
      .slice(-BODY_FETCH_LIMIT);

    let rawByUid = new Map();
    if (bodyTargets.length) {
      const bodyResult = await session.run(`UID FETCH ${bodyTargets.join(',')} (UID BODY.PEEK[])`);
      rawByUid = literalsByUid(bodyResult);
    }

    const account = String(email || '').trim().toLowerCase();
    const messages = rows.map((row) => {
      const entry = rawByUid.get(row.uid);
      const text = entry ? extractMessageText(decodeImapBytes(entry.bytes)) : '';
      return {
        sourceId: `${provider}:${account}:${row.uid}`,
        subject: row.subject,
        sender: row.sender,
        recipient: row.recipient,
        receivedAt: row.receivedMs ? new Date(row.receivedMs).toISOString() : '',
        receivedMs: row.receivedMs,
        text: text.slice(0, MAX_BODY_CHARS),
      };
    });

    return { messages, nextUidCursor };
  } finally {
    await session.close();
  }
}