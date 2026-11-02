import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { adaptReservationDraft } from '../../shared/journeyFormAdapter.ts';
import { createJourneyItemCanonical, JourneyItemError } from '../../shared/journeyItemPersist.ts';
import { findDuplicateForItem, isParticipantRole, normalizeEmail } from '../../shared/reservationImport.ts';

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

    // Same adapter the automatic path uses: resolves places/airports + UTC
    // instants and applies the standard form's minimum-data rules.
    const adapted = await adaptReservationDraft(draft, imp.source_subject || 'Imported reservation');

    const duplicate = findDuplicateForItem(existingItems, [adapted.payload, draft]);
    if (duplicate) {
      const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
        status: 'duplicate',
        created_item_id: duplicate.item.id,
        suggested_gathering_id: gatheringId,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: user.id,
      });
      return Response.json({ import: updated, duplicate: true, item: duplicate });
    }

    // Not enough data for the standard schema: keep it pending and report the
    // missing fields instead of creating an incomplete segment.
    if (adapted.status === 'incomplete') {
      const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
        suggested_gathering_id: gatheringId,
        pending_reason: adapted.missing.join(','),
      });
      return Response.json({
        error: 'This reservation is missing required details',
        reason: 'incomplete',
        missing: adapted.missing,
        import: updated,
      }, { status: 422 });
    }

    let created;
    try {
      created = await createJourneyItemCanonical(base44, {
        gatheringId,
        actorUserId: member.user_id || user.id,
        actorName: member.full_name || user.full_name || '',
        actorEmail: user.email || '',
        payload: adapted.payload,
        origin: req.headers.get('origin') || '',
      });
    } catch (e: any) {
      if (e instanceof JourneyItemError) {
        const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
          suggested_gathering_id: gatheringId,
          pending_reason: (e.missing || []).join(','),
        });
        return Response.json({ error: e.message, missing: e.missing || [], import: updated }, { status: e.status });
      }
      throw e;
    }

    const updated = await base44.asServiceRole.entities.ReservationImport.update(importId, {
      status: 'manual_created',
      suggested_gathering_id: gatheringId,
      created_item_id: created.id,
      pending_reason: '',
      resolved_at: new Date().toISOString(),
      resolved_by_user_id: user.id,
    });
    return Response.json({ import: updated, item: created });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}