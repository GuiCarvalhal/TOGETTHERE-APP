import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { isInboxProvider, syncInboxForUser } from '../../shared/inboxConnectors.ts';

// Runs a mailbox sync for the signed-in user. `force` skips the throttle so the
// "Sync now" button always does something.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const provider = typeof body?.provider === 'string' ? body.provider.trim().toLowerCase() : '';
    if (provider && !isInboxProvider(provider)) {
      return Response.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const results = await syncInboxForUser(base44, user, {
      provider: provider || '',
      force: Boolean(body?.force),
    });

    return Response.json({ ok: true, results });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Sync failed' }, { status: 500 });
  }
}