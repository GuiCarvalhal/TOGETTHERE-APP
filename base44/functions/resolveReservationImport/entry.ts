import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  buildJourneyPayloadFromDraft,
  createJourneyItemFromImport,
  isLikelyDuplicate,
  isParticipantRole,
  normalizeEmail,
} from '../../shared/reservationImport.ts';

function isAuthorizedForImport(imp: any, user: any) {
  const keys = Array.isArray(imp?.target_user_keys) ? imp.target_user_keys : [];
  const byId = keys.includes(user.id);
  const email = normalizeEmail(user.email || '');
  const byEmail = email ? keys.includes(email) : false;
  return byId || byEmail;
}

function resolveMemberForUser(members: any[], user: any) {
  const byId = (members || []).find((m) => m.user_id === user.id);
  if (byId) return byId;
  const email = normalizeEmail(user.email || '');
  if (!email) return null;
  return (members || []).find((m) => {
    const uid = normalizeEmail(m.user_id || '');
    const em = normalizeEmail(m.email || '');
    return uid === email || em === email;
  }) || null;
}

export default async function(req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const importId = typeof body?.import_id === 'string' ? body.import_id.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : 'create';
    const gatheringIdInput = typeof body?.gathering_id === 'string' ? body.gathering_id.trim() : '';
    if (!importId) return Response.json({ error: 'import_id is required' }, { status: 400 });
    if (action !== 'create' && action !== 'discard') {
      return Response.json({ error: 'action must be create or discard' }, { status: 400 });
    }

    const imp = await base44.asServiceRole.entities.ReservationImport.get(importId);
    if (!imp) return Response.json({ error: 'Import not found' }, { status: 404 });
    if (!isAuthorizedForImport(imp, user)) {
      return Response.json({ error: 'Not allowed' }, { status: 403 });
    }
    if (imp.status !== 'pending') {
      return Response.json({ error: 'Import is not pending anymore' }, { status: 409 });
    }

    if (action === 'discard') {
      const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
        status: 'discarded',
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: user.id,
      });
      return Response.json({ import: updated, discarded: true });
    }

    const gatheringId = gatheringIdInput || imp.suggested_gathering_id || '';
    if (!gatheringId) return Response.json({ error: 'gathering_id is required for create' }, { status: 400 });

    const [gathering, members, existingItems] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringId),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringId }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringId }),
    ]);
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });

    const member = resolveMemberForUser(members, user);
    if (!member || !isParticipantRole(member.role)) {
      return Response.json({ error: 'Only participants can import to this gathering' }, { status: 403 });
    }

    const draft = imp.extracted_draft || {};
    const duplicate = isLikelyDuplicate(existingItems, draft?.confirmation_number);
    if (duplicate) {
      const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
        status: 'duplicate',
        created_item_id: duplicate.id,
        suggested_gathering_id: gatheringId,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: user.id,
      });
      return Response.json({ import: updated, duplicate: true, item: duplicate });
    }

    const payload = buildJourneyPayloadFromDraft(
      draft,
      imp.source_subject || 'Imported reservation'
    );
    const created = await createJourneyItemFromImport(base44, {
      gathering,
      members,
      targetUserId: member.user_id || user.id,
      payload,
    });

    const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
      status: 'manual_created',
      suggested_gathering_id: gatheringId,
      created_item_id: created.id,
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: user.id,
    });
    return Response.json({ import: updated, item: created });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

