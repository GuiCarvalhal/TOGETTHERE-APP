import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { inboxItemPayload, markInboxItem, INBOX_STATUS } from '../../shared/journeyInbox.ts';
import { createJourneyItemCanonical, JourneyItemError } from '../../shared/journeyItemPersist.ts';
import { findDuplicateForItem, isParticipantRole, normalizeEmail } from '../../shared/reservationImport.ts';

// Files one journey-inbox segment into a gathering, or dismisses it.
//
// Filing goes through the canonical create (same contract, ACL and side effects
// as the standard form), carrying the stored attachments — which include the
// FULL source email. Nothing in the inbox is ever written straight to a
// gathering without that path.

function isOwner(row: any, user: any) {
  const keys = Array.isArray(row?.target_user_keys) ? row.target_user_keys : [];
  if (keys.includes(user.id)) return true;
  const email = normalizeEmail(user.email || '');
  return !!email && keys.includes(email);
}

function resolveMemberForUser(members: any[], user: any) {
  const byId = (members || []).find((m: any) => m.user_id === user.id);
  if (byId) return byId;
  const email = normalizeEmail(user.email || '');
  if (!email) return null;
  return (members || []).find((m: any) => {
    const uid = normalizeEmail(m.user_id || '');
    const em = normalizeEmail(m.email || '');
    return uid === email || em === email;
  }) || null;
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const itemId = typeof body?.item_id === 'string' ? body.item_id.trim() : '';
    const action = typeof body?.action === 'string' ? body.action.trim() : 'file';
    const gatheringIdInput = typeof body?.gathering_id === 'string' ? body.gathering_id.trim() : '';
    if (!itemId) return Response.json({ error: 'item_id is required' }, { status: 400 });
    if (action !== 'file' && action !== 'dismiss') {
      return Response.json({ error: 'action must be file or dismiss' }, { status: 400 });
    }

    const row = await base44.asServiceRole.entities.JourneyInboxItem.get(itemId);
    if (!row) return Response.json({ error: 'Item not found' }, { status: 404 });
    if (!isOwner(row, user)) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (row.status !== INBOX_STATUS.new) {
      return Response.json({ error: 'This item is not in the inbox anymore' }, { status: 409 });
    }

    if (action === 'dismiss') {
      const updated = await markInboxItem(base44, itemId, {
        status: INBOX_STATUS.dismissed,
      });
      if (row.import_id) {
        try {
          await base44.asServiceRole.entities.ReservationImport.update(row.import_id, {
            status: 'discarded',
            resolved_at: new Date().toISOString(),
            resolved_by_user_id: user.id,
          });
        } catch {
          // The import row is bookkeeping only.
        }
      }
      return Response.json({ item: updated, dismissed: true });
    }

    if (!gatheringIdInput) return Response.json({ error: 'gathering_id is required' }, { status: 400 });

    const [gathering, members, existingItems] = await Promise.all([
      base44.asServiceRole.entities.Gathering.get(gatheringIdInput),
      base44.asServiceRole.entities.Member.filter({ gathering_id: gatheringIdInput }),
      base44.asServiceRole.entities.JourneyItem.filter({ gathering_id: gatheringIdInput }),
    ]);
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });

    const member = resolveMemberForUser(members || [], user);
    if (!member || !isParticipantRole(member.role)) {
      return Response.json({ error: 'Only participants can import to this gathering' }, { status: 403 });
    }

    const payload = inboxItemPayload(row);

    const duplicate = findDuplicateForItem(existingItems || [], [payload, row]);
    if (duplicate) {
      const updated = await markInboxItem(base44, itemId, {
        status: INBOX_STATUS.filed,
        filed_item_id: duplicate.item.id,
        filed_gathering_id: gatheringIdInput,
        filed_at: new Date().toISOString(),
      });
      return Response.json({ item: updated, duplicate: true, journey_item: duplicate.item });
    }

    let created;
    try {
      created = await createJourneyItemCanonical(base44, {
        gatheringId: gatheringIdInput,
        actorUserId: member.user_id || user.id,
        actorName: member.full_name || user.full_name || '',
        actorEmail: user.email || '',
        payload,
        origin: req.headers.get('origin') || '',
      });
    } catch (e: any) {
      if (e instanceof JourneyItemError) {
        const updated = await markInboxItem(base44, itemId, { missing: e.missing || [] });
        return Response.json({ error: e.message, missing: e.missing || [], item: updated }, { status: e.status });
      }
      throw e;
    }

    const updated = await markInboxItem(base44, itemId, {
      status: INBOX_STATUS.filed,
      filed_item_id: created.id,
      filed_gathering_id: gatheringIdInput,
      filed_at: new Date().toISOString(),
      missing: [],
    });

    if (row.import_id) {
      try {
        await base44.asServiceRole.entities.ReservationImport.update(row.import_id, {
          status: 'manual_created',
          suggested_gathering_id: gatheringIdInput,
          created_item_id: created.id,
          pending_reason: '',
          resolved_at: new Date().toISOString(),
          resolved_by_user_id: user.id,
        });
      } catch {
        // The import row is bookkeeping only.
      }
    }

    return Response.json({ item: updated, journey_item: created });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}