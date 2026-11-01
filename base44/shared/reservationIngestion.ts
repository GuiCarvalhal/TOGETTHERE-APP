// Shared reservation ingestion used by BOTH entry points:
//   - receiveReservationEmail  (external inbound-token endpoint / forwarded mail)
//   - the native inbox connectors (Gmail + Outlook.com sync)
//
// Keeping parse -> match -> create in one place means the two paths can never
// drift apart: whatever an inbound webhook produces today, an inbox sync
// produces identically.

import { extractJourneyDraft } from './extractJourneyDraft.ts';
import {
  classifyReservation,
  decideReservationPolicy,
  isReservationAiFallbackEnabled,
} from './reservationClassifier.ts';
import {
  buildJourneyPayloadFromDraft,
  chooseGatheringMatch,
  createJourneyItemFromImport,
  findDuplicateItem,
  isParticipantRole,
  normalizeEmail,
  normalizeUserKeys,
} from './reservationImport.ts';

const MAX_CONTENT = 20000;

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
};

// Parses one message into a ReservationImport row, auto-creating a JourneyItem
// when the gathering match is confident. Returns { record, reused } — reused
// means this source message id was already ingested (no LLM call happens).
export async function ingestReservationMessage(base44: any, input: IngestInput) {
  const messageId = (input?.messageId || '').trim();

  if (messageId) {
    const existing = await base44.asServiceRole.entities.ReservationImport.filter({ source_message_id: messageId });
    if (existing && existing[0]) return { record: existing[0], reused: true };
  }

  const text = (input?.text || '').trim();
  if (!text) return { record: null, reused: false };

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

  // 2) Optional AI fallback, OFF unless RESERVATION_AI_FALLBACK=true. Runs only
  //    for messages the rules could not classify confidently, and its draft can
  //    only ever reach the pending queue — never an automatic item.
  if (policy.outcome !== 'auto_create' && !classification.denied && isReservationAiFallbackEnabled()) {
    try {
      const aiDraft = await extractJourneyDraft(base44, content, sourceSubject || 'Imported reservation');
      if (aiDraft && (aiDraft.type !== 'other' || aiDraft.start_datetime)) {
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

  const target = await resolveTargetUser(base44, input?.targetHints || {});
  const participantMemberships = (target.memberships || []).filter((m: any) => isParticipantRole(m.role));
  const gatheringIds = [...new Set(participantMemberships.map((m: any) => m.gathering_id).filter(Boolean))];

  let match: any = { confident: false, suggestedGatheringId: '', topScore: 0, reason: '', candidateGatheringIds: [] };
  const byId = new Map<string, any>();
  const itemsByGathering: Record<string, any[]> = {};
  if (hasDraft && gatheringIds.length) {
    const [gatherings, journeyItems] = await Promise.all([
      base44.asServiceRole.entities.Gathering.list('-created_date', 500),
      Promise.all(gatheringIds.map((gid: string) => base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }))),
    ]);
    for (const g of gatherings || []) byId.set(g.id, g);
    gatheringIds.forEach((gid: string, idx: number) => { itemsByGathering[gid] = journeyItems[idx] || []; });
    const candidateGatherings = gatheringIds.map((id: string) => byId.get(id)).filter(Boolean);
    match = chooseGatheringMatch(draft, candidateGatherings, itemsByGathering);
  }

  let status = hasDraft ? 'pending' : 'ignored';
  let createdItemId = '';
  let error = '';
  if (hasDraft && policy.outcome === 'auto_create' && target.targetUserId && match.confident && match.suggestedGatheringId) {
    try {
      const duplicate = findDuplicateItem(itemsByGathering[match.suggestedGatheringId], draft);
      if (duplicate) {
        status = 'duplicate';
        createdItemId = duplicate.item.id;
      } else {
        const gathering = byId.get(match.suggestedGatheringId);
        const members = await base44.asServiceRole.entities.Member.filter({ gathering_id: match.suggestedGatheringId });
        const payload = buildJourneyPayloadFromDraft(draft, sourceSubject || 'Imported reservation');
        const created = await createJourneyItemFromImport(base44, {
          gathering,
          members,
          targetUserId: target.targetUserId,
          payload,
        });
        status = 'auto_created';
        createdItemId = created.id;
      }
    } catch (e: any) {
      status = 'pending';
      error = e?.message || 'Could not auto-create journey item';
    }
  }

  const record = await base44.asServiceRole.entities.ReservationImport.create({
    status,
    source_message_id: messageId || '',
    source_subject: sourceSubject || '',
    source_sender: sourceSender || '',
    source_recipient: sourceRecipient || '',
    source_received_at: sourceReceivedAt || undefined,
    content_excerpt: content.slice(0, 500),
    target_user_id: target.targetUserId || '',
    target_user_email: target.targetUserEmail || '',
    target_user_keys: normalizeUserKeys(target.targetUserId || '', target.targetUserEmail || ''),
    suggested_gathering_id: match.suggestedGatheringId || '',
    candidate_gathering_ids: match.candidateGatheringIds || [],
    auto_match_score: match.topScore || 0,
    auto_match_reason: match.reason || '',
    extracted_draft: draft,
    classification_type: classification.type,
    classification_confidence: Math.round(classification.confidence * 100) / 100,
    classification_signals: classification.signals,
    classification_reason: classification.reason,
    classification_source: classificationSource,
    ignored_reason: ignoredReason || '',
    created_item_id: createdItemId || '',
    error: error || '',
    resolved_at: status === 'auto_created' || status === 'duplicate' || status === 'ignored'
      ? new Date().toISOString()
      : undefined,
  });

  return { record, reused: false };
}