// Shared reservation ingestion used by BOTH entry points:
//   - receiveReservationEmail  (external inbound-token endpoint / forwarded mail)
//   - the native inbox connectors (Gmail + Outlook.com + iCloud + Yahoo sync)
//
// Keeping parse -> split -> adapt -> match -> create in one place means the paths
// can never drift apart: whatever an inbound webhook produces today, an inbox sync
// produces identically.
//
// One message can hold SEVERAL bookings (a round trip is two flights, a package is
// a flight plus a hotel). The content is therefore split into segments, and each
// segment becomes its own ReservationImport row and its own journey-inbox item,
// with the FULL source email attached to every one of them.
//
// Creation goes through the SAME pipeline as the standard item form: the segment
// draft is adapted per type (resolved places/airports + UTC times, see
// journeyFormAdapter.ts), validated against the form's minimum data, and persisted
// by the canonical create (journeyItemPersist.ts). Nothing is written straight to
// the database, and an incomplete segment stays pending with an explicit reason
// instead of creating a half-empty item.

import { extractJourneyDrafts } from './extractJourneyDraft.ts';
import {
  classifyReservation,
  decideReservationPolicy,
  isReservationAiFallbackEnabled,
} from './reservationClassifier.ts';
import { adaptReservationDraft } from './journeyFormAdapter.ts';
import { createJourneyItemCanonical, JourneyItemError } from './journeyItemPersist.ts';
import { uploadSourceEmail } from './reservationAttachment.ts';
import { createInboxItem, INBOX_STATUS } from './journeyInbox.ts';
import {
  chooseGatheringMatch,
  findDuplicateForItem,
  isParticipantRole,
  normalizeEmail,
  normalizeUserKeys,
} from './reservationImport.ts';

const MAX_CONTENT = 20000;
const MAX_SEGMENTS = 8;

export function normalizeEmailLike(value: unknown) {
  if (typeof value !== 'string') return '';
  const fromBracket = value.match(/<([^>]+)>/);
  if (fromBracket?.[1]) return normalizeEmail(fromBracket[1]);
  return normalizeEmail(value);
}

// Resolves which app user an inbound message belongs to, accepting either an
// explicit user id or an email that appears on one of their Member records.
export async function resolveTargetUser(base44: any, hints: any) {
  const explicitUserId = typeof hints?.targetUserId === 'string' ? hints.targetUserId.trim() : '';
  const explicitEmail = normalizeEmailLike(hints?.targetUserEmail) ||
    normalizeEmailLike(hints?.userEmail) ||
    normalizeEmailLike(hints?.forwardedBy) ||
    normalizeEmailLike(hints?.from) ||
    normalizeEmailLike(hints?.sender);

  if (explicitUserId) {
    const memberships = await base44.asServiceRole.entities.Member.filter({ user_id: explicitUserId });
    return { targetUserId: explicitUserId, targetUserEmail: explicitEmail, memberships: memberships || [] };
  }

  if (!explicitEmail) return { targetUserId: '', targetUserEmail: '', memberships: [] };

  const [byEmail, byUserId, byContact] = await Promise.all([
    base44.asServiceRole.entities.Member.filter({ email: explicitEmail }),
    base44.asServiceRole.entities.Member.filter({ user_id: explicitEmail }),
    base44.asServiceRole.entities.Member.filter({ contact_info: explicitEmail }),
  ]);
  const all = [...(byEmail || []), ...(byUserId || []), ...(byContact || [])];
  if (!all.length) {
    return { targetUserId: '', targetUserEmail: explicitEmail, memberships: [] };
  }

  const countByUid = new Map<string, number>();
  for (const m of all) {
    if (!m?.user_id) continue;
    countByUid.set(m.user_id, (countByUid.get(m.user_id) || 0) + 1);
  }
  const ranked = [...countByUid.entries()].sort((a, b) => b[1] - a[1]);
  const targetUserId = ranked.length ? ranked[0][0] : '';
  const memberships = targetUserId ? all.filter((m) => m.user_id === targetUserId) : all;
  return { targetUserId, targetUserEmail: explicitEmail, memberships };
}

export type IngestInput = {
  messageId?: string;
  subject?: string;
  sender?: string;
  recipient?: string;
  receivedAt?: string;
  text?: string;
  // Raw hint bag consumed by resolveTargetUser (targetUserId / targetUserEmail
  // or the inbound webhook's from/sender/userEmail fields).
  targetHints?: any;
  // Where this message came from (stored on the inbox rows).
  source?: 'inbox_sync' | 'webhook' | 'manual';
};

type SegmentContext = {
  base44: any;
  target: any;
  participantMemberships: any[];
  emailFileUri: string;
  emailContent: string;
  source: string;
  sourceMeta: { subject: string; sender: string; recipient: string; receivedAt: string };
  messageId: string;
  policy: any;
  classification: any;
  classificationSource: string;
  autoCreateGathering?: { gatheringId: string; score: number; reason: string; candidateIds: string[] };
  // The owner's inbox rows still waiting, loaded once per message and extended
  // as this message's segments are stored, so the same booking is never queued
  // twice (same message or a re-send of the same confirmation email).
  existingInboxItems: any[];
};

// Files ONE segment: adapts it to the standard payload, tries the automatic
// gathering match, creates the item when everything lines up, and always stores
// the segment in the journey inbox so an unused reservation is never lost.
async function ingestSegment(ctx: SegmentContext, draft: any, index: number, total: number) {
  const { base44, target, sourceMeta, emailFileUri } = ctx;
  const fallbackTitle = total > 1
    ? `${sourceMeta.subject || 'Imported reservation'} (${index + 1}/${total})`
    : (sourceMeta.subject || 'Imported reservation');

  const withAttachment = {
    ...draft,
    attachments: emailFileUri ? [emailFileUri] : (Array.isArray(draft?.attachments) ? draft.attachments : []),
  };

  const adapted = await adaptReservationDraft(withAttachment, fallbackTitle);

  let match: any = { confident: false, suggestedGatheringId: '', topScore: 0, reason: '', candidateGatheringIds: [] };
  let status = 'pending';
  let createdItemId = '';
  let error = '';
  let pendingReason = adapted.status === 'incomplete' ? adapted.missing.join(',') : '';

  const autoCreate = ctx.autoCreateGathering && ctx.policy.outcome === 'auto_create' && target.targetUserId;
  if (autoCreate) {
    const gatheringId = ctx.autoCreateGathering!.gatheringId;
    match = {
      confident: true,
      suggestedGatheringId: gatheringId,
      topScore: ctx.autoCreateGathering!.score,
      reason: ctx.autoCreateGathering!.reason,
      candidateGatheringIds: ctx.autoCreateGathering!.candidateIds,
    };

    const membership = ctx.participantMemberships.find((m: any) => m.gathering_id === gatheringId);
    const duplicate = await findDuplicateInGathering(base44, gatheringId, adapted.payload, withAttachment);

    if (duplicate) {
      status = 'duplicate';
      createdItemId = duplicate.id;
    } else if (adapted.status === 'incomplete') {
      // Never create a half-empty segment silently: keep it pending, say why.
      status = 'pending';
    } else {
      try {
        const created = await createJourneyItemCanonical(base44, {
          gatheringId,
          actorUserId: target.targetUserId,
          actorName: membership?.full_name || '',
          actorEmail: target.targetUserEmail || '',
          payload: adapted.payload,
        });
        status = 'auto_created';
        createdItemId = created.id;
      } catch (e: any) {
        status = 'pending';
        pendingReason = e instanceof JourneyItemError ? (e.missing || []).join(',') : pendingReason;
        error = e?.message || 'Could not auto-create journey item';
      }
    }
  }

  const importRecord = await base44.asServiceRole.entities.ReservationImport.create({
    status,
    segment_index: index,
    segment_count: total,
    source_message_id: ctx.messageId || '',
    source_subject: sourceMeta.subject || '',
    source_sender: sourceMeta.sender || '',
    source_recipient: sourceMeta.recipient || '',
    source_received_at: sourceMeta.receivedAt || undefined,
    content_excerpt: ctx.emailContent.slice(0, 500),
    target_user_id: target.targetUserId || '',
    target_user_email: target.targetUserEmail || '',
    target_user_keys: normalizeUserKeys(target.targetUserId || '', target.targetUserEmail || ''),
    suggested_gathering_id: match.suggestedGatheringId || '',
    candidate_gathering_ids: match.candidateGatheringIds || [],
    auto_match_score: match.topScore || 0,
    auto_match_reason: match.reason || '',
    extracted_draft: withAttachment,
    classification_type: ctx.classification.type,
    classification_confidence: Math.round((ctx.classification.confidence || 0) * 100) / 100,
    classification_signals: ctx.classification.signals,
    classification_reason: ctx.classification.reason,
    classification_source: ctx.classificationSource,
    ignored_reason: '',
    pending_reason: pendingReason || '',
    created_item_id: createdItemId || '',
    error: error || '',
    resolved_at: status === 'auto_created' || status === 'duplicate' ? new Date().toISOString() : undefined,
  });

  // The journey inbox: the durable home for this segment. A segment that landed
  // in a gathering is stored as filed so it never shows up as an unfinished item.
  // A booking already waiting in the inbox is not queued a second time.
  const existingInbox = target.targetUserId
    ? findDuplicateForItem(ctx.existingInboxItems, [adapted.payload])
    : null;

  if (target.targetUserId && !existingInbox) {
    try {
      const inboxRow = await createInboxItem(base44, {
        payload: adapted.payload,
        ownerUserId: target.targetUserId,
        ownerEmail: target.targetUserEmail || '',
        missing: adapted.missing,
        source: ctx.source as any,
        sourceSubject: sourceMeta.subject || '',
        sourceSender: sourceMeta.sender || '',
        sourceReceivedAt: sourceMeta.receivedAt || '',
        sourceContent: ctx.emailContent.slice(0, MAX_CONTENT),
        importId: importRecord.id,
        status: createdItemId ? INBOX_STATUS.filed : INBOX_STATUS.new,
        filedItemId: createdItemId,
        filedGatheringId: createdItemId ? (match.suggestedGatheringId || '') : '',
      });
      ctx.existingInboxItems.push(inboxRow);
    } catch {
      // The inbox is a convenience copy: a failure must not lose the import row.
    }
  }

  // Nothing was created for this segment AND the booking is already queued in the
  // inbox: resolve the row as a duplicate so Home does not ask about it again.
  if (existingInbox && status === 'pending') {
    const resolved = await base44.asServiceRole.entities.ReservationImport.update(importRecord.id, {
      status: 'duplicate',
      created_item_id: existingInbox.filed_item_id || '',
      resolved_at: new Date().toISOString(),
    }).catch(() => null);
    return resolved || importRecord;
  }

  return importRecord;
}

async function findDuplicateInGathering(base44: any, gatheringId: string, payload: any, draft: any) {
  try {
    const items = await base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId });
    const duplicate = findDuplicateForItem(items || [], [payload, draft]);
    return duplicate?.item || null;
  } catch {
    return null;
  }
}

// Parses one message into ReservationImport rows (one per detected segment),
// auto-creating JourneyItems when the gathering match is confident AND the
// segment holds the standard form's minimum data. Returns
// { record, records, reused } — `record` is the first segment (kept for callers
// that only care about one), `reused` means this source message id was already
// ingested so no model call happens.
export async function ingestReservationMessage(base44: any, input: IngestInput) {
  const messageId = (input?.messageId || '').trim();

  if (messageId) {
    const existing = await base44.asServiceRole.entities.ReservationImport.filter({ source_message_id: messageId });
    if (existing && existing.length) {
      return { record: existing[0], records: existing, reused: true };
    }
  }

  const text = (input?.text || '').trim();
  if (!text) return { record: null, records: [], reused: false };

  const sourceSubject = (input?.subject || '').trim();
  const sourceSender = normalizeEmailLike(input?.sender);
  const sourceRecipient = normalizeEmailLike(input?.recipient);
  const sourceReceivedRaw = (input?.receivedAt || '').trim();
  const sourceReceivedAt = sourceReceivedRaw && Number.isFinite(Date.parse(sourceReceivedRaw))
    ? new Date(sourceReceivedRaw).toISOString()
    : '';

  const content = text.slice(0, MAX_CONTENT);

  // 1) Deterministic classification. This is the whole default path: rules +
  //    confidence, no AI, identical for every provider.
  const classification = classifyReservation({ subject: sourceSubject, text: content });
  let policy = decideReservationPolicy(classification);
  let draft = classification.draft;
  let classificationSource: 'rules' | 'ai' | 'none' = policy.outcome === 'ignore' ? 'none' : 'rules';
  let ignoredReason = policy.outcome === 'ignore' ? policy.reasonCode : '';
  // Kept so the extraction the fallback already paid for is reused below instead
  // of asking the model twice for the same message.
  let aiSegments: any[] | null = null;

  // 2) Optional AI fallback, OFF unless RESERVATION_AI_FALLBACK=true. Runs only
  //    for messages the rules could not classify confidently, and its draft can
  //    only ever reach the pending queue — never an automatic item.
  if (policy.outcome !== 'auto_create' && !classification.denied && isReservationAiFallbackEnabled()) {
    try {
      const aiDrafts = await extractJourneyDrafts(base44, content, sourceSubject || 'Imported reservation');
      const aiDraft = aiDrafts[0];
      if (aiDraft && (aiDraft.type !== 'other' || aiDraft.start_datetime)) {
        aiSegments = aiDrafts;
        draft = aiDraft;
        classificationSource = 'ai';
        policy = { outcome: 'pending', reasonCode: 'ai_fallback' };
        ignoredReason = '';
      }
    } catch {
      // The deterministic result stands; a failed fallback must not block ingestion.
    }
  }

  const hasDraft = policy.outcome !== 'ignore';

  if (!hasDraft) {
    const target = await resolveTargetUser(base44, input?.targetHints || {});
    const record = await base44.asServiceRole.entities.ReservationImport.create({
      status: 'ignored',
      segment_index: 0,
      segment_count: 0,
      source_message_id: messageId || '',
      source_subject: sourceSubject || '',
      source_sender: sourceSender || '',
      source_recipient: sourceRecipient || '',
      source_received_at: sourceReceivedAt || undefined,
      content_excerpt: content.slice(0, 500),
      target_user_id: target.targetUserId || '',
      target_user_email: target.targetUserEmail || '',
      target_user_keys: normalizeUserKeys(target.targetUserId || '', target.targetUserEmail || ''),
      classification_type: classification.type,
      classification_confidence: Math.round(classification.confidence * 100) / 100,
      classification_signals: classification.signals,
      classification_reason: classification.reason,
      classification_source: 'none',
      ignored_reason: ignoredReason || '',
      resolved_at: new Date().toISOString(),
    });
    return { record, records: [record], reused: false };
  }

  // 3) Split the message into every booking it describes. The model returns the
  //    segments; the rule-based draft is the fallback when it finds nothing.
  let segments = aiSegments ? aiSegments.slice(0, MAX_SEGMENTS) : [draft];
  if (!aiSegments) {
    try {
      const extracted = await extractJourneyDrafts(base44, content, sourceSubject || 'Imported reservation');
      if (extracted.length) {
        segments = extracted.slice(0, MAX_SEGMENTS);
        if (extracted.length > 1) classificationSource = 'ai';
      }
    } catch {
      // Keep the single rule-based draft.
    }
  }

  // 4) The source email, attached to every segment (uploaded once per message).
  const emailFileUri = await uploadSourceEmail(base44, {
    subject: sourceSubject,
    sender: sourceSender,
    recipient: sourceRecipient,
    receivedAt: sourceReceivedAt,
    text: content,
    messageId,
  });

  const target = await resolveTargetUser(base44, input?.targetHints || {});
  const participantMemberships = (target.memberships || []).filter((m: any) => isParticipantRole(m.role));
  const gatheringIds = [...new Set(participantMemberships.map((m: any) => m.gathering_id).filter(Boolean))];

  // 5) Candidate gatherings + their existing items, loaded once for every segment.
  const candidateGatherings: any[] = [];
  const itemsByGathering: Record<string, any[]> = {};
  if (gatheringIds.length) {
    const [gatherings, journeyItems] = await Promise.all([
      base44.asServiceRole.entities.Gathering.list('-created_date', 500),
      Promise.all(gatheringIds.map((gid: string) => base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }))),
    ]);
    const byId = new Map<string, any>();
    for (const g of gatherings || []) byId.set(g.id, g);
    gatheringIds.forEach((gid: string, idx: number) => { itemsByGathering[gid] = journeyItems[idx] || []; });
    for (const id of gatheringIds) {
      const gathering = byId.get(id);
      if (gathering) candidateGatherings.push(gathering);
    }
  }

  const inboxRows = target.targetUserId
    ? await base44.asServiceRole.entities.JourneyInboxItem
      .filter({ owner_user_id: target.targetUserId, status: INBOX_STATUS.new })
      .catch(() => [])
    : [];
  const existingInboxItems = Array.isArray(inboxRows) ? inboxRows : (inboxRows?.items || []);

  const ctx: SegmentContext = {
    base44,
    target,
    existingInboxItems,
    participantMemberships,
    emailFileUri,
    emailContent: content,
    source: input?.source || 'inbox_sync',
    sourceMeta: {
      subject: sourceSubject,
      sender: sourceSender,
      recipient: sourceRecipient,
      receivedAt: sourceReceivedAt,
    },
    messageId,
    policy,
    classification,
    classificationSource,
  };

  const records = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    // The automatic match is decided per segment (a hotel leg can point at a
    // different gathering than its flight does), reusing the loaded data.
    const match = candidateGatherings.length
      ? chooseGatheringMatch(segment, candidateGatherings, itemsByGathering)
      : null;
    const autoCreateGathering = match && match.confident && match.suggestedGatheringId
      ? {
        gatheringId: match.suggestedGatheringId,
        score: match.topScore,
        reason: match.reason,
        candidateIds: match.candidateGatheringIds || [],
      }
      : undefined;

    try {
      records.push(await ingestSegment(
        { ...ctx, autoCreateGathering },
        segment,
        index,
        segments.length,
      ));
    } catch (e: any) {
      // One failing segment must never swallow the rest of the message, or the
      // remaining bookings would be lost for good (the message id is already
      // marked as processed). Record it as failed instead.
      const failed = await base44.asServiceRole.entities.ReservationImport.create({
        status: 'failed',
        segment_index: index,
        segment_count: segments.length,
        source_message_id: messageId || '',
        source_subject: sourceSubject || '',
        source_sender: sourceSender || '',
        source_recipient: sourceRecipient || '',
        source_received_at: sourceReceivedAt || undefined,
        content_excerpt: content.slice(0, 500),
        target_user_id: target.targetUserId || '',
        target_user_email: target.targetUserEmail || '',
        target_user_keys: normalizeUserKeys(target.targetUserId || '', target.targetUserEmail || ''),
        classification_type: classification.type,
        classification_confidence: Math.round((classification.confidence || 0) * 100) / 100,
        classification_signals: classification.signals,
        classification_reason: classification.reason,
        classification_source: classificationSource,
        error: e?.message || 'Could not import this segment',
        resolved_at: new Date().toISOString(),
      }).catch(() => null);
      if (failed) records.push(failed);
    }
  }

  return { record: records[0] || null, records, reused: false };
}