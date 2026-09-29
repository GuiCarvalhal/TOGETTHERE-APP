import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { gatheringOwnerUserId } from '../../shared/gatheringAcl.ts';

// Delete an entire gathering and every record scoped to it. Runs as the
// service role (bypassing RLS) so the permission can be enforced explicitly:
// ONLY the gathering Owner may delete — never admins, members, or viewers
// (and not even a platform app-admin, since this is irreversible and the
// owner asked for owner-only access). Cascades through every child entity so
// no orphaned records remain.
//
// Records removed (all scoped to gathering_id, except JourneyNote which is
// scoped to the gathering's journey items):
//   - JourneyNote   (by journey_item_id $in the gathering's JourneyItem ids)
//   - ExpenseSplit  (by gathering_id)
//   - Expense       (by gathering_id)
//   - JourneyItem   (by gathering_id)
//   - Task          (by gathering_id)
//   - Activity      (by gathering_id)
//   - JoinRequest   (by gathering_id)
//   - Member        (by gathering_id)
//   - Gathering     (by id)  — last, after all children are gone
// Family records are user-scoped (not gathering-scoped) and are NOT touched.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    let gathering;
    try {
      gathering = await base44.asServiceRole.entities.Gathering.get(gathering_id);
    } catch {
      gathering = null;
    }
    if (!gathering) return Response.json({ error: 'Gathering not found' }, { status: 404 });

    const members = await base44.asServiceRole.entities.Member.filter({ gathering_id });
    const ownerUid = gatheringOwnerUserId(gathering, members);
    if (ownerUid !== user.id) {
      return Response.json({ error: 'Only the gathering owner can delete this gathering' }, { status: 403 });
    }

    // Fetch journey item ids so their per-user notes can be cleaned up too.
    const journeyItems = await base44.asServiceRole.entities.JourneyItem.filter({ gathering_id });
    const journeyItemIds = (journeyItems || []).map((j) => j.id).filter(Boolean);

    // Delete children before the parent.
    if (journeyItemIds.length) {
      await base44.asServiceRole.entities.JourneyNote.deleteMany({ journey_item_id: { $in: journeyItemIds } });
    }
    await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.Expense.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.JourneyItem.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.Task.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.Activity.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.JoinRequest.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.Member.deleteMany({ gathering_id });
    await base44.asServiceRole.entities.Gathering.delete(gathering_id);

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}