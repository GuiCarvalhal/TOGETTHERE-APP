// Permanent, cascading removal of a gathering and every record scoped to it.
//
// Only purgeDeletedItems calls this: a gathering first goes through a soft
// delete (is_deleted + deleted_at + deleted_by) and becomes eligible here once
// the 30-day retention window has passed. Everything is done with deleteMany so
// a retry, or a second purge that finds the row already gone, is harmless.

export async function hardDeleteGathering(base44: any, gatheringId: string) {
  // Per-user notes hang off the gathering's journey items, so collect those ids
  // before the items themselves disappear.
  const journeyItems = await base44.asServiceRole.entities.JourneyItem
    .filter({ gathering_id: gatheringId })
    .catch(() => []);
  const journeyItemIds = (journeyItems || []).map((j: any) => j.id).filter(Boolean);

  if (journeyItemIds.length) {
    await base44.asServiceRole.entities.JourneyNote
      .deleteMany({ journey_item_id: { $in: journeyItemIds } })
      .catch(() => null);
  }

  await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.Expense.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.JourneyItem.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.Task.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.Activity.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.JoinRequest.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  await base44.asServiceRole.entities.Member.deleteMany({ gathering_id: gatheringId }).catch(() => null);
  // Last, after every child is gone. A 404 here means an earlier run already
  // finished the job, which is the outcome we want anyway.
  await base44.asServiceRole.entities.Gathering
    .delete(gatheringId)
    .catch((e: any) => (e?.status === 404 ? null : Promise.reject(e)));

  return { journey_items: journeyItemIds.length };
}