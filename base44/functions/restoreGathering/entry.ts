import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';
import { restorePatch } from '../../shared/softDelete.ts';

// Bring a gathering back from Recently deleted. Clearing the flags is all it
// takes: the record and every child row were kept intact, so segments,
// expenses, splits, members, tasks, activity and join requests reappear with
// their original ids, dates and permissions.
//
// Same gate as deleting: the gathering Owner only. Idempotent — restoring a
// gathering that is already live is a no-op success.
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
      return Response.json({ error: 'Only the gathering owner can restore this gathering' }, { status: 403 });
    }

    if (gathering.is_deleted !== true) return Response.json({ ok: true, already_active: true });

    await base44.asServiceRole.entities.Gathering.update(gathering_id, restorePatch());
    return Response.json({ ok: true, restored: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}