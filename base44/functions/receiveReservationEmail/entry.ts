import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { extractJourneyDraft } from '../../shared/extractJourneyDraft.ts';
import {
  buildInboundText,
  buildJourneyPayloadFromDraft,
  chooseGatheringMatch,
  createJourneyItemFromImport,
  isLikelyDuplicate,
  isParticipantRole,
  normalizeEmail,
  normalizeUserKeys,
} from '../../shared/reservationImport.ts';

const MAX_CONTENT = 20000;

function getToken(req: Request) {
  const bearer = req.headers.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  const header = req.headers.get('x-togetthere-token');
  if (header) return header.trim();
  const url = new URL(req.url);
  return (url.searchParams.get('token') || '').trim();
}

function normalizeEmailLike(value: unknown) {
  if (typeof value !== 'string') return '';
  const fromBracket = value.match(/<([^>]+)>/);
  if (fromBracket?.[1]) return normalizeEmail(fromBracket[1]);
  return normalizeEmail(value);
}

async function resolveTargetUser(base44: any, body: any) {
  const explicitUserId = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
  const explicitEmail = normalizeEmailLike(body?.targetUserEmail) ||
    normalizeEmailLike(body?.userEmail) ||
    normalizeEmailLike(body?.forwardedBy) ||
    normalizeEmailLike(body?.from) ||
    normalizeEmailLike(body?.sender);

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

export default async function(req: Request) {
  try {
    const token = secrets.get('RESERVATION_INBOX_TOKEN');
    const incomingToken = getToken(req);
    if (!token || !incomingToken || incomingToken !== token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const messageId = (typeof body?.messageId === 'string' ? body.messageId : body?.internetMessageId || body?.id || '').trim();
    const sourceSubject = (typeof body?.subject === 'string' ? body.subject : '').trim();
    const sourceSender = normalizeEmailLike(body?.from || body?.sender || body?.fromAddress);
    const sourceRecipient = normalizeEmailLike(body?.to || body?.recipient || body?.toAddress);
    const sourceReceivedRaw = (typeof body?.receivedAt === 'string' ? body.receivedAt : body?.date || '').trim();
    const sourceReceivedAt = sourceReceivedRaw && Number.isFinite(Date.parse(sourceReceivedRaw))
      ? new Date(sourceReceivedRaw).toISOString()
      : '';

    if (messageId) {
      const existing = await base44.asServiceRole.entities.ReservationImport.filter({ source_message_id: messageId });
      if (existing && existing[0]) {
        return Response.json({ import: existing[0], reused: true });
      }
    }

    const text = buildInboundText(body);
    if (!text) return Response.json({ error: 'No reservation content to parse' }, { status: 400 });
    const content = text.slice(0, MAX_CONTENT);
    const draft = await extractJourneyDraft(base44, content, sourceSubject || 'Imported reservation');

    const target = await resolveTargetUser(base44, body);
    const participantMemberships = (target.memberships || []).filter((m: any) => isParticipantRole(m.role));
    const gatheringIds = [...new Set(participantMemberships.map((m: any) => m.gathering_id).filter(Boolean))];
    const [gatherings, journeyItems] = await Promise.all([
      base44.asServiceRole.entities.Gathering.list('-created_date', 500),
      Promise.all(gatheringIds.map((gid: string) => base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gid }))),
    ]);
    const byId = new Map((gatherings || []).map((g: any) => [g.id, g]));
    const candidateGatherings = gatheringIds.map((id: string) => byId.get(id)).filter(Boolean);
    const itemsByGathering: Record<string, any[]> = {};
    gatheringIds.forEach((gid: string, idx: number) => { itemsByGathering[gid] = journeyItems[idx] || []; });
    const match = chooseGatheringMatch(draft, candidateGatherings, itemsByGathering);

    let status = 'pending';
    let createdItemId = '';
    let error = '';
    if (target.targetUserId && match.confident && match.suggestedGatheringId) {
      try {
        const duplicate = isLikelyDuplicate(itemsByGathering[match.suggestedGatheringId], draft.confirmation_number);
        if (duplicate) {
          status = 'duplicate';
          createdItemId = duplicate.id;
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
      created_item_id: createdItemId || '',
      error: error || '',
      resolved_at: status === 'auto_created' || status === 'duplicate' ? new Date().toISOString() : undefined,
    });

    return Response.json({
      ok: true,
      status,
      import: record,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

