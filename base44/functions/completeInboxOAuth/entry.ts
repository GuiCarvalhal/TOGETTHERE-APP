import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  exchangeAuthorizationCode,
  fetchProviderAccountEmail,
  resolveCallbackUrl,
  resolveSuccessUrl,
  upsertConnection,
} from '../../shared/inboxConnectors.ts';

// OAuth callback target (a browser GET redirect from Google / Microsoft), so it
// cannot rely on an app session. Authenticity comes from the single-use,
// short-lived state token minted by startInboxOAuth for a specific user.
// Every outcome redirects the browser back into the app rather than returning
// JSON, so the user never ends up staring at a raw function response.
export default async function(req) {
  const requestUrl = new URL(req.url);
  const code = (requestUrl.searchParams.get('code') || '').trim();
  const stateToken = (requestUrl.searchParams.get('state') || '').trim();
  const providerError = (requestUrl.searchParams.get('error') || '').trim();

  const fail = (reason: string) => Response.redirect(
    resolveSuccessUrl(req, { inbox: 'error', reason }),
    302,
  );

  try {
    if (providerError) return fail(providerError);

    const base44 = createClientFromRequest(req);

    if (!code || !stateToken) return fail('missing_code');

    const rows = await base44.asServiceRole.entities.InboxOAuthState.filter({ state_token: stateToken });
    const record = rows && rows[0];
    if (!record) return fail('invalid_state');
    if (record.used_at) return fail('state_already_used');

    const expiresMs = Date.parse(record.expires_at || '');
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) return fail('state_expired');

    await base44.asServiceRole.entities.InboxOAuthState.update(record.id, {
      used_at: new Date().toISOString(),
    });

    const provider = record.provider;
    const redirectUri = resolveCallbackUrl(req);
    const tokens = await exchangeAuthorizationCode(provider, { code, redirectUri });
    if (!tokens.accessToken) return fail('no_access_token');

    const providerAccountEmail = (await fetchProviderAccountEmail(
      provider,
      tokens.accessToken,
      tokens.idToken || '',
    ) || '').trim();
    // Yahoo mailboxes are keyed by address and sign in to IMAP with it, so an
    // unidentified mailbox cannot be stored.
    if (provider === 'yahoo' && !providerAccountEmail) return fail('missing_account_email');

    await upsertConnection(base44, {
      provider,
      user: { id: record.target_user_id, email: record.target_user_email || '' },
      tokens,
      providerAccountEmail,
    });

    return Response.redirect(
      resolveSuccessUrl(req, { inbox: 'connected', provider }),
      302,
    );
  } catch (error: any) {
    return fail('exchange_failed');
  }
}