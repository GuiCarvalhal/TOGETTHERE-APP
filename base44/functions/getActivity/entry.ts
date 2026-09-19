import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const gatheringId = body.gathering_id;
    if (!gatheringId) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    const activities = await base44.entities.Activity.filter({ gathering_id: gatheringId }, '-created_date', 10);
    return Response.json({ activities: activities || [] });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}