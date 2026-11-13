import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { SOFT_DELETE_RETENTION_DAYS, isPurgeable } from '../../shared/softDelete.ts';
import { hardDeleteGathering } from '../../shared/gatheringPurge.ts';

// Scheduled cleanup for the Recently deleted areas. Permanently removes
// soft-deleted gatherings, journey segments and expenses whose 30-day
// retention window has expired — a gathering takes its segments, expenses,
// splits, members, tasks, activity, join requests and notes with it.
//
// Runs daily from the "Purge recently deleted" workflow. Safe to re-run: it only
// ever touches rows already soft-deleted past retention, and every delete is
// idempotent, so a retry after a partial run finishes the job without harm.
// Anything still inside the window is left untouched and stays restorable.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [journey, expenses, gatherings] = await Promise.all([
      base44.asServiceRole.entities.JourneyItem.filter({ is_deleted: true }),
      base44.asServiceRole.entities.Expense.filter({ is_deleted: true }),
      base44.asServiceRole.entities.Gathering.filter({ is_deleted: true }),
    ]);
    const now = Date.now();
    const staleGatherings = (gatherings || []).filter((r: any) => isPurgeable(r, now));
    const staleJourney = (journey || []).filter((r: any) => isPurgeable(r, now));
    const staleExpenses = (expenses || []).filter((r: any) => isPurgeable(r, now));

    // Gatherings first: their children are removed with them, so the item passes
    // below then simply find nothing left to delete.
    const purgedGatherings: string[] = [];
    for (const g of staleGatherings) {
      try {
        await hardDeleteGathering(base44, g.id);
        purgedGatherings.push(g.id);
      } catch {
        // Leave it for the next run rather than aborting the whole sweep.
      }
    }

    await Promise.allSettled(staleJourney.map((r: any) =>
      base44.asServiceRole.entities.JourneyItem.delete(r.id).catch(() => null)));
    await Promise.allSettled(staleExpenses.map(async (r: any) => {
      await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ expense_id: r.id }).catch(() => null);
      await base44.asServiceRole.entities.Expense.delete(r.id).catch(() => null);
    }));

    return Response.json({
      ok: true,
      retention_days: SOFT_DELETE_RETENTION_DAYS,
      purged_gatherings: purgedGatherings.length,
      purged_journey_items: staleJourney.length,
      purged_expenses: staleExpenses.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}