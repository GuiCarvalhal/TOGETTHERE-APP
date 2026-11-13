import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { softDeletePatch } from '../../shared/softDelete.ts';

// Move an entire gathering to Recently deleted. Nothing is removed on this
// pass: the row is flagged (is_deleted + deleted_at + deleted_by) and every
// normal gathering list filters it out, while its segments, expenses, splits,
// members, tasks, activity and join requests stay untouched — so a restore
// returns the gathering exactly as it was.
//
// Only the gathering Owner may do this (never admins, members or viewers).
// Permanent removal happens later, and only in purgeDeletedItems, once the
// 30-day retention window has passed.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const gathering = await base44.asServiceRole.entities.Gathering
      .get(gathering_id)
      .catch((e) => (e.status === 404 ? null : Promise.reject(e)));
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });

    const members = await base44.asServiceRole.entities.Member.filter({ gathering_id });
    const ownerUid = gatheringOwnerUserId(gathering, members);
    if (ownerUid !== user.id) {
      return Response.json({ error: 'Only the gathering owner can delete this gathering' }, { status: 403 });
    }

    // Already in Recently deleted: idempotent no-op so a retry is safe.
    if (gathering.is_deleted === true) return Response.json({ ok: true, already_deleted: true });

    await base44.asServiceRole.entities.Gathering.update(gathering_id, softDeletePatch(user.id));
    return Response.json({ ok: true, soft_deleted: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}