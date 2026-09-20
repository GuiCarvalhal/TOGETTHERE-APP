import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

// Returns the OneSignal App ID (safe for the client) and whether push is configured.
// The REST API key is never exposed.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const appId = process.env.OneSignal_AppID || '';
    return Response.json({ appId, configured: Boolean(appId) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}