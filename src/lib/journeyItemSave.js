import { base44 } from '@/api/base44Client';
import { wallTimeToUtcIso } from '@/lib/formatPlaceTime';

// Shared journey-item persistence for the journey form (sheet) and the flight
// page. Builds the canonical payload from the shared form state and submits it
// to the existing createJourneyItem / updateJourneyItem backend functions, so
// the save path is written once and both surfaces stay in sync. ACL fields
// (member_user_ids) and owner_id are still reconciled server-side; this only
// sends the user-editable fields plus attendee_user_ids (the opt-in list).
//
// `meta` is the TYPE_META entry for the segment type ({ fromTo, place }), which
// decides which location fields are included — identical to the sheet form.
export function buildJourneyPayload({ form, attendeeIds, startTz, endTz, meta, currentMember, item, gatheringId }) {
  return {
    gathering_id: gatheringId,
    owner_id: item?.owner_id || currentMember?.user_id,
    type: form.type,
    title: form.title.trim(),
    start_datetime: form.start_datetime ? wallTimeToUtcIso(form.start_datetime, startTz) : undefined,
    end_datetime: form.end_datetime ? wallTimeToUtcIso(form.end_datetime, endTz) : undefined,
    location_from: meta.fromTo ? form.location_from : undefined,
    location_to: meta.fromTo ? form.location_to : undefined,
    location_name: meta.place ? form.location_name : undefined,
    ...(meta.fromTo ? { from_place: form.from_place || null, to_place: form.to_place || null } : {}),
    ...(meta.place ? { place: form.place || null } : {}),
    confirmation_number: form.confirmation_number,
    booking_reference: form.booking_reference,
    airline: form.airline || undefined,
    notes: form.notes,
    attachments: form.attachments,
    attendee_user_ids: attendeeIds,
  };
}

export async function submitJourneyItem({ isEdit, gatheringId, itemId, payload }) {
  if (isEdit) {
    await base44.functions.invoke('updateJourneyItem', { gathering_id: gatheringId, item_id: itemId, payload });
  } else {
    await base44.functions.invoke('createJourneyItem', { gathering_id: gatheringId, payload });
  }
}