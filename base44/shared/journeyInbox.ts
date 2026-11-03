// The journey inbox: imported segments that are not (yet) part of a gathering.
//
// Nothing is lost when an imported reservation cannot be filed right away: every
// detected segment is stored here with the SAME standard payload the item form
// saves (resolved places, UTC instants, attachments including the source email),
// so the inbox renders it with the identical JourneyCard and filing it later goes
// through the one canonical create path.

import { buildStandardItemPayload } from './journeyItemContract.ts';
import { normalizeUserKeys } from './reservationImport.ts';

export const INBOX_STATUS = { new: 'new', filed: 'filed', dismissed: 'dismissed' } as const;

const STANDARD_FIELDS = [
  'type', 'title', 'start_datetime', 'end_datetime', 'location_from', 'location_to',
  'location_name', 'confirmation_number', 'booking_reference', 'airline', 'notes',
];

function emptyToUndefined(value: unknown) {
  if (value === '' || value === null) return undefined;
  return value;
}

export type CreateInboxItemArgs = {
  payload: any;
  ownerUserId: string;
  ownerEmail: string;
  missing?: string[];
  source?: 'inbox_sync' | 'webhook' | 'manual';
  sourceSubject?: string;
  sourceSender?: string;
  sourceReceivedAt?: string;
  sourceContent?: string;
  importId?: string;
  status?: string;
  filedItemId?: string;
  filedGatheringId?: string;
};

export async function createInboxItem(base44: any, args: CreateInboxItemArgs) {
  const payload = buildStandardItemPayload(args?.payload || {});
  const row: any = {
    owner_user_id: args.ownerUserId,
    target_user_keys: normalizeUserKeys(args.ownerUserId, args.ownerEmail || ''),
    status: args.status || INBOX_STATUS.new,
    missing: Array.isArray(args.missing) ? args.missing : [],
    source: args.source || 'inbox_sync',
    source_subject: args.sourceSubject || '',
    source_sender: args.sourceSender || '',
    source_received_at: args.sourceReceivedAt || undefined,
    source_content: args.sourceContent || '',
    import_id: args.importId || '',
    filed_item_id: args.filedItemId || '',
    filed_gathering_id: args.filedGatheringId || '',
    filed_at: args.filedItemId ? new Date().toISOString() : undefined,
  };

  for (const field of STANDARD_FIELDS) {
    const value = emptyToUndefined(payload[field]);
    if (value !== undefined) row[field] = value;
  }

  row.attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  if (payload.from_place) row.from_place = payload.from_place;
  if (payload.to_place) row.to_place = payload.to_place;
  if (payload.place) row.place = payload.place;
  if (!row.type) row.type = 'other';
  if (!row.title) row.title = args.sourceSubject || 'Imported reservation';

  return base44.asServiceRole.entities.JourneyInboxItem.create(row);
}

// The stored inbox row already holds the standard payload shape, so it can be
// handed straight to the canonical create after the user picks a gathering.
export function inboxItemPayload(row: any) {
  return buildStandardItemPayload({
    type: row?.type,
    title: row?.title,
    start_datetime: row?.start_datetime,
    end_datetime: row?.end_datetime,
    location_from: row?.location_from,
    location_to: row?.location_to,
    location_name: row?.location_name,
    confirmation_number: row?.confirmation_number,
    booking_reference: row?.booking_reference,
    airline: row?.airline,
    notes: row?.notes,
    attachments: Array.isArray(row?.attachments) ? row.attachments : [],
    from_place: row?.from_place,
    to_place: row?.to_place,
    place: row?.place,
  });
}

export async function markInboxItem(base44: any, id: string, patch: any) {
  return base44.asServiceRole.entities.JourneyInboxItem.update(id, patch);
}