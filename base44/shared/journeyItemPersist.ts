// Canonical JourneyItem create — the ONE write path for a segment.
//
// Extracted from the createJourneyItem backend function so the standard form
// (createJourneyItem), the manual import resolution (resolveReservationImport)
// and the inbox ingestion pipeline all persist through the exact same code:
// same contract/sanitizer/validation, same ACL bookkeeping, same place photo,
// same activity entry and notifications. Nothing writes a JourneyItem directly
// anymore — an inbox import can no longer produce a shape the form wouldn't.

import {
  getMyMember,
  allMemberUserIds,
  participantUserIds,
  gatheringOwnerUserId,
  matchMyMember,
} from './gatheringAcl.ts';
import { logActivity } from './logActivity.ts';
import { notifyGatheringMembers, isOneSignalConfigured } from './onesignal.ts';
import { resolveItemPhotoUrl } from './journeyPhoto.ts';
import { buildStandardItemPayload, validateStandardItem } from './journeyItemContract.ts';

function env(name: string) {
  try {
    const value = process.env?.[name];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

export class JourneyItemError extends Error {
  status: number;
  missing: string[];

  constructor(message: string, status = 400, missing: string[] = []) {
    super(message);
    this.name = 'JourneyItemError';
    this.status = status;
    this.missing = missing;
  }
}

export type CreateJourneyItemArgs = {
  gatheringId: string;
  actorUserId: string;
  actorName?: string;
  actorEmail?: string;
  // Raw segment fields (form payload or adapted import payload). Sanitized and
  // validated here, so a crafted or partial payload can never reach the DB.
  payload: any;
  origin?: string;
  // Google Maps key for the place photo (entries pass secrets.get(...)).
  mapsKey?: string;
};

export async function createJourneyItemCanonical(base44: any, args: CreateJourneyItemArgs) {
  const { gatheringId, actorUserId, payload, origin, mapsKey } = args || ({} as any);
  if (!gatheringId) throw new JourneyItemError('gathering_id is required', 400);
  if (!actorUserId) throw new JourneyItemError('An owner is required', 400);

  // 1) Contract: same field map + same minimum-data rules as the item form.
  const built = buildStandardItemPayload(payload || {});
  const validation = validateStandardItem(built);
  if (!validation.ok) {
    throw new JourneyItemError(
      `The segment is missing required details: ${validation.missing.join(', ')}`,
      422,
      validation.missing,
    );
  }

  // 2) Authorization: participants only, never viewers.
  const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId });
  const me = (await getMyMember(base44, gatheringId, actorUserId)) ||
    matchMyMember(members, { id: actorUserId, email: args.actorEmail });
  if (!me || me.role === 'viewer') {
    throw new JourneyItemError('Only participants can add journey segments', 403);
  }

  // 3) Main Event: at most one per gathering. A gathering with a Main Event
  //    functions as an event group (not a trip); the Main Event owns its dates.
  if (built.type === 'main_event') {
    const existingMain = await base44.asServiceRole.entities.JourneyItem.filter({
      gathering_id: gatheringId, type: 'main_event',
    });
    if (existingMain && existingMain.length > 0) {
      throw new JourneyItemError(
        'This gathering already has a Main Event. A gathering can have at most one Main Event.',
        409,
      );
    }
  }

  const gathering = await base44.asServiceRole.entities.Gathering.get(gatheringId);
  const ownerUid = gatheringOwnerUserId(gathering, members);
  const memberUserIds = allMemberUserIds(members);
  const participantUids = new Set(participantUserIds(members));

  // 4) Attendees: the creator is always included; requested ids must be current
  //    participants (viewers can never become attendees). member_user_ids (the
  //    ACL read list) still covers every member.
  const requestedAttendees = Array.isArray(payload?.attendee_user_ids)
    ? payload.attendee_user_ids.filter((id: string) => participantUids.has(id))
    : [];
  const attendeeUserIds = [...new Set([actorUserId, ...requestedAttendees])].filter(Boolean);

  const created = await base44.asServiceRole.entities.JourneyItem.create({
    ...built,
    gathering_id: gatheringId,
    owner_id: actorUserId,
    owner_user_id: ownerUid,
    member_user_ids: memberUserIds,
    attendee_user_ids: attendeeUserIds,
  });

  // 5) Cache a Google Places photo at create time so cards never re-fetch.
  //    Best-effort: a failure leaves place_photo unset and the card falls back
  //    to its placeholder; resolvePlacePhoto can still fill it later.
  const photoKey = mapsKey || env('GOOGLEMAPS_TOGETTHERE');
  if (photoKey) {
    const photoUrl = await resolveItemPhotoUrl(base44, created, photoKey);
    if (photoUrl) {
      await base44.asServiceRole.entities.JourneyItem.update(created.id, { place_photo: photoUrl });
      created.place_photo = photoUrl;
    }
  }

  const actorName = me.full_name || args.actorName || 'Someone';
  try {
    await logActivity(base44, {
      gatheringId, type: 'journey_added',
      actorUserId, actorName,
      summary: `${actorName} added "${built.title}" to the journey`,
      ownerUserId: ownerUid, participantUserIds: memberUserIds,
    });
    if (isOneSignalConfigured()) {
      const route = `/gathering/${gatheringId}/journey`;
      await notifyGatheringMembers(base44, {
        gatheringId, category: 'journey', excludeUserIds: [actorUserId],
        heading: 'New journey segment',
        message: `${actorName} added "${built.title}" to the journey.`,
        data: { gathering_id: gatheringId, route, kind: 'journey_added' },
        url: origin ? origin + route : undefined,
        dedupKey: `journey_added:${created.id}`,
      });
    }
  } catch {
    // Side effects (activity feed / push) must never lose a saved segment.
  }

  return created;
}