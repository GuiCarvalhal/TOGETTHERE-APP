import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { createJourneyItemCanonical, JourneyItemError } from '../../shared/journeyItemPersist.ts';

// HTTP entry for creating a journey segment. All the work (contract, minimum
// data, ACL, main-event rule, place photo, activity, notifications) lives in
// the shared canonical create — this wrapper only authenticates and maps errors,
// so the form, a flight save and an inbox import share one write path.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { gathering_id, payload } = body;
    if (!gathering_id || !payload) {
      return Response.json({ error: 'gathering_id and payload required' }, { status: 400 });
    }

    const item = await createJourneyItemCanonical(base44, {
      gatheringId: gathering_id,
      actorUserId: user.id,
      actorName: user.full_name || '',
      actorEmail: user.email || '',
      payload,
      origin: req.headers.get('origin') || '',
      mapsKey: secrets.get('GOOGLEMAPS_TOGETTHERE'),
    });

    return Response.json({ item });
  } catch (error) {
    const status = error instanceof JourneyItemError ? error.status : 500;
    return Response.json(
      { error: error.message, ...(error?.missing?.length ? { missing: error.missing } : {}) },
      { status },
    );
  }
}