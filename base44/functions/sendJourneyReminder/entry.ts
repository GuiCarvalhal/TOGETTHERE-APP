import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';

// Scheduled journey reminders. Finds journey items starting within the next
// `window_hours` (default 24) that haven't been reminded yet, notifies the
// gathering's eligible members, and stamps reminder_sent_at to avoid duplicates.
// Intended to be invoked by a scheduled workflow per gathering.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const { gathering_id, window_hours } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });
    if (!isOneSignalConfigured()) return Response.json({ error: 'Push notifications are not configured' }, { status: 503 });

    const gathering = await base44.asServiceRole.entities.Gathering.get(gathering_id);
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });

    const windowMs = (Number(window_hours) || 24) * 3600 * 1000;
    const now = Date.now();
    const horizon = now + windowMs;

    const items = await base44.asServiceRole.entities.JourneyItem.filter({ gathering_id });
    const upcoming = (items || []).filter((it) => {
      if (!it.start_datetime) return false;
      const t = new Date(it.start_datetime).getTime();
      if (t < now || t > horizon) return false;
      if (it.reminder_sent_at && new Date(it.reminder_sent_at).getTime() > now - windowMs) return false;
      return true;
    });

    const origin = req.headers.get('origin') || '';
    const route = `/gathering/${gathering_id}/journey`;
    let sent = 0;
    for (const it of upcoming) {
      const when = new Date(it.start_datetime);
      const time = when.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
      const result = await notifyGatheringMembers(base44, {
        gatheringId: gathering_id,
        category: 'reminders',
        excludeUserIds: it.owner_id ? [it.owner_id] : [],
        heading: 'Upcoming journey segment',
        message: `"${it.title}" starts soon — ${time}.`,
        data: { gathering_id, route, kind: 'journey_reminder' },
        url: origin ? origin + route : undefined,
        dedupKey: `reminder:${it.id}`,
      });
      if (result.ok && result.sent > 0) sent += result.sent;
      await base44.asServiceRole.entities.JourneyItem.update(it.id, { reminder_sent_at: new Date().toISOString() });
    }

    return Response.json({ ok: true, reminded: upcoming.length, sent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}