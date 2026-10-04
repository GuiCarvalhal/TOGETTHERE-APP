import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';
import { getMyMember, allMemberUserIds, participantUserIds, gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { logActivity } from '../../shared/logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from '../../shared/onesignal.ts';
import { resolveItemPhotoUrl, placeDefiningFields } from '../../shared/journeyPhoto.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, item_id, payload } = body;
    if (!gathering_id || !item_id || !payload) return Response.json({ error: 'gathering_id, item_id and payload required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || me.role === 'viewer') return Response.json({ error: 'Only participants can edit journey segments' }, { status: 403 });

    const existing = await base44.asServiceRole.entities.JourneyItem.get(item_id);
    if (!existing || existing.gathering_id !== gathering_id) return Response.json({ error: 'Segment not found' }, { status: 404 });
    const canEdit =
      existing.owner_id === user.id ||
      existing.owner_user_id === user.id ||
      me.role === 'owner' ||
      me.role === 'admin';
    if (!canEdit) return Response.json({ error: 'You can only edit your own segments' }, { status: 403 });

    const [gathering, members] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gathering_id),
      base44.asServiceRole.entities.Member.filter({ gathering_id }),
    ]);
    const ownerUid = gatheringOwnerUserId(gathering, members);
    const memberUserIds = allMemberUserIds(members);
    const participantUids = new Set(participantUserIds(members));

    // Attendee selection from the form: validate ids against current
    // PARTICIPANTS (owner/member) only — viewers can never be attendees. The
    // original creator is kept only if they are still a participant (a creator
    // later demoted to viewer is not forced back in). Preserves and allows
    // changing the attendee list on edit; member_user_ids (ACL) keeps all.
    const updateFields: any = {
      ...payload,
      gathering_id,
      owner_id: existing.owner_id,
      owner_user_id: ownerUid,
      member_user_ids: memberUserIds,
    };
    if (Array.isArray(payload.attendee_user_ids)) {
      const valid = payload.attendee_user_ids.filter((id) => participantUids.has(id));
      const keepOwner = existing.owner_id && participantUids.has(existing.owner_id) ? [existing.owner_id] : [];
      updateFields.attendee_user_ids = [...new Set([...keepOwner, ...valid])].filter(Boolean);
    }
    await base44.asServiceRole.entities.JourneyItem.update(item_id, updateFields);

    // Re-resolve the place photo when a place-defining field changed on edit
    // and either no photo is cached or the place moved. Best-effort: a failure
    // leaves the existing place_photo intact. Avoids burning Places quota on
    // edits that don't touch the location (e.g. notes/time/attendee changes).
    const mapsKey = secrets.get('GOOGLEMAPS_TOGETTHERE');
    if (mapsKey) {
      const fields = placeDefiningFields(existing.type);
      const placeChanged = fields.some((f) => {
        const oldVal = (existing[f] || '').toString().trim();
        const newVal = (payload[f] != null ? payload[f] : existing[f] || '').toString().trim();
        return oldVal !== newVal;
      });
      if (placeChanged || !existing.place_photo) {
        const merged = { ...existing, ...updateFields };
        const photoUrl = await resolveItemPhotoUrl(base44, merged, mapsKey);
        if (photoUrl) {
          await base44.asServiceRole.entities.JourneyItem.update(item_id, { place_photo: photoUrl });
        }
      }
    }

    await logActivity(base44, {
      gatheringId: gathering_id, type: 'journey_added',
      actorUserId: user.id, actorName: me.full_name || user.full_name || 'Someone',
      summary: `${me.full_name || 'Someone'} updated "${payload.title || existing.title}" in the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });

    if (isOneSignalConfigured()) {
      const origin = req.headers.get('origin') || '';
      const route = `/gathering/${gathering_id}/journey`;
      await notifyGatheringMembers(base44, {
        gatheringId: gathering_id, category: 'journey', excludeUserIds: [user.id],
        heading: 'Journey updated',
        message: `${me.full_name || 'Someone'} updated "${payload.title || existing.title}".`,
        data: { gathering_id, route, kind: 'journey_updated' },
        url: origin ? origin + route : undefined,
        dedupKey: `journey_updated:${item_id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}