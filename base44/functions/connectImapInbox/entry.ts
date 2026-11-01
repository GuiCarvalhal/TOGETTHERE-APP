import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  encryptImapCredential,
  imapCredentialsAvailable,
  imapErrorCode,
  isImapProvider,
  testImapLogin,
} from '../../shared/imapInbox.ts';
import { normalizeUserKeys } from '../../shared/reservationImport.ts';

// Connects an iCloud or Yahoo mailbox with an app password (no OAuth). The
// password is verified against the real IMAP server first, then stored
// AES-GCM encrypted on the connection record — it is never logged and never
// returned to the client.
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    const email = typeof body?.email === 'string' ? body.email.trim() : '';
    // App passwords are shown with spaces; strip them.
    const appPassword = typeof body?.appPassword === 'string' ? body.appPassword.replace(/\s+/g, '') : '';

    if (!isImapProvider(provider)) return Response.json({ error: 'invalid_provider' }, { status: 400 });
    if (!imapCredentialsAvailable()) return Response.json({ error: 'not_configured' }, { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: 'invalid_email' }, { status: 400 });
    if (!appPassword) return Response.json({ error: 'missing_password' }, { status: 400 });

    try {
      await testImapLogin(provider, { email, appPassword });
    } catch (error: any) {
      return Response.json({ error: imapErrorCode(error) }, { status: 400 });
    }

    const credential = await encryptImapCredential(appPassword);
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
      provider_account_email: email,
      credential_secret: credential,
      uid_cursor: 0,
      sync_cursor: '',
      last_error: '',
      connected_at: now,
      updated_at: now,
    };

    if (existing && existing[0]) {
      await base44.asServiceRole.entities.InboxConnection.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.InboxConnection.create({
        ...payload,
        access_token: '',
        refresh_token: '',
        access_token_expires_at: '',
        last_sync_at: '',
      });
    }

    return Response.json({ ok: true, provider, providerAccountEmail: email });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Could not connect mailbox' }, { status: 500 });
  }
}