import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  buildAuthorizationUrl,
  inboxProviderConfigStatus,
  isInboxProvider,
  resolveCallbackUrl,
} from '../../shared/inboxConnectors.ts';
import { isImapProvider } from '../../shared/imapInbox.ts';
import { normalizeUserKeys } from '../../shared/reservationImport.ts';

const STATE_TTL_MS = 15 * 60 * 1000;

// Starts a mailbox OAuth flow: stores a single-use state token bound to the
// signed-in user, then returns the provider's authorization URL for the browser
// to follow.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    if (!isInboxProvider(provider)) {
      return Response.json({ error: 'Invalid provider' }, { status: 400 });
    }
    if (isImapProvider(provider)) {
      // iCloud/Yahoo authenticate with an app password via connectImapInbox.
      return Response.json({ error: 'use_credential_connect', provider }, { status: 400 });
    }

    if (!inboxProviderConfigStatus()[provider]) {
      return Response.json({ error: 'not_configured', provider }, { status: 400 });
    }

    const stateToken = crypto.randomUUID();
    await base44.asServiceRole.entities.InboxOAuthState.create({
      state_token: stateToken,
      provider,
      target_user_id: user.id,
      target_user_email: user.email || '',
      target_user_keys: normalizeUserKeys(user.id, user.email || ''),
      expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    });

    const redirectUri = resolveCallbackUrl(req);
    const url = buildAuthorizationUrl(provider, { state: stateToken, redirectUri });

    return Response.json({ ok: true, provider, url, redirectUri });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not start the connection' }, { status: 500 });
  }
}