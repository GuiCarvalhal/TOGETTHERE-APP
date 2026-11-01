import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  encryptImapCredential,
  imapCredentialsAvailable,
  imapErrorCode,
  isAppPasswordProvider,
  testImapLogin,
} from '../../shared/imapInbox.ts';
import { normalizeUserKeys } from '../../shared/reservationImport.ts';
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  connectionAccountKey,
  findAccountConnection,
  isInboxProvider,
} from '../../shared/inboxConnectors.ts';

const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 256;

function normalizedEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim() : '';
  if (!email || email.length > EMAIL_MAX) return '';
  return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email) ? email : '';
}

// App-specific passwords are long opaque tokens (Apple shows xxxx-xxxx-xxxx-xxxx),
// so anything implausibly short or long is rejected before it reaches a server.
function normalizedAppPassword(value: unknown) {
  const password = typeof value === 'string' ? value.replace(/\s+/g, '') : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return '';
  return password;
}

// Connects an iCloud mailbox with an app-specific password (Yahoo is OAuth-only).
// The password is verified against the real IMAP server first, then stored
// AES-GCM encrypted with an identified key on the connection record — it is never
// logged and never returned to the client. Failures answer with a fixed code, not
// with the mail server's own wording.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';

    if (!isInboxProvider(provider)) return Response.json({ error: 'invalid_provider' }, { status: 400 });
    if (!isAppPasswordProvider(provider)) {
      return Response.json({ error: 'use_oauth', provider }, { status: 400 });
    }
    if (!imapCredentialsAvailable()) {
      return Response.json({ error: 'credentials_key_missing' }, { status: 400 });
    }

    const email = normalizedEmail(body?.email);
    const appPassword = normalizedAppPassword(body?.appPassword);
    if (!email) return Response.json({ error: 'invalid_email' }, { status: 400 });
    if (!appPassword) return Response.json({ error: 'invalid_password' }, { status: 400 });

    try {
      await testImapLogin(provider, { email, appPassword });
    } catch (error: any) {
      return Response.json({ error: imapErrorCode(error) }, { status: 400 });
    }

    let credential: string;
    try {
      credential = await encryptImapCredential(appPassword);
    } catch (error: any) {
      return Response.json({ error: imapErrorCode(error) }, { status: 400 });
    }
    const now = new Date().toISOString();
    // Keyed by mailbox address: reconnecting the same address refreshes its row,
    // a different address becomes an additional account for the same provider.
    const existing = await findAccountConnection(base44, { userId: user.id, provider, email });

    const payload = {
      provider,
      status: 'connected',
      target_user_id: user.id,
      target_user_email: user.email || '',
      target_user_keys: normalizeUserKeys(user.id, user.email || ''),
      account_key: connectionAccountKey(provider, email),
      display_label: existing?.display_label || email,
      provider_account_email: email,
      credential_secret: credential,
      uid_cursor: 0,
      sync_cursor: '',
      sync_started_at: '',
      last_error: '',
      connected_at: now,
      updated_at: now,
    };

    let connectionId = existing?.id || '';
    if (existing) {
      await base44.asServiceRole.entities.InboxConnection.update(existing.id, {
        ...payload,
        // iCloud never holds OAuth tokens; clear any that a legacy Yahoo row left.
        access_token: '',
        refresh_token: '',
        access_token_expires_at: '',
      });
    } else {
      const created = await base44.asServiceRole.entities.InboxConnection.create({
        ...payload,
        sync_interval_minutes: DEFAULT_SYNC_INTERVAL_MINUTES,
        access_token: '',
        refresh_token: '',
        access_token_expires_at: '',
        last_sync_at: '',
        last_attempt_at: '',
        next_sync_at: '',
      });
      connectionId = created?.id || '';
    }

    return Response.json({
      ok: true,
      provider,
      providerAccountEmail: email,
      connectionId,
      created: !existing,
    });
  } catch {
    return Response.json({ error: 'connect_failed' }, { status: 500 });
  }
}