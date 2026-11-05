import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { SOFT_DELETE_RETENTION_DAYS, isPurgeable } from '../../shared/softDelete.ts';

// Cleanup helper for the Recently deleted area. Permanently removes soft-deleted
// journey segments and expenses whose retention window (30 days) has expired,
// together with the expense splits that belong to them. Anything still inside
// the window is left untouched and stays restorable.
//
// Safe to run on a schedule: it is idempotent and only ever touches rows that
// were already soft-deleted past retention. Callable by an app admin, or with no
// user context (scheduled workflow / automation).
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const [journey, expenses] = await Promise.all([
      base44.asServiceRole.entities.JourneyItem.filter({ is_deleted: true }),
      base44.asServiceRole.entities.Expense.filter({ is_deleted: true }),
    ]);
    const now = Date.now();
    const staleJourney = (journey || []).filter((r) => isPurgeable(r, now));
    const staleExpenses = (expenses || []).filter((r) => isPurgeable(r, now));

    await Promise.allSettled(staleJourney.map((r) => base44.asServiceRole.entities.JourneyItem.delete(r.id)));
    await Promise.allSettled(staleExpenses.map(async (r) => {
      await base44.asServiceRole.entities.ExpenseSplit.deleteMany({ expense_id: r.id });
      await base44.asServiceRole.entities.Expense.delete(r.id);
    }));

    return Response.json({
      ok: true,
      retention_days: SOFT_DELETE_RETENTION_DAYS,
      purged_journey_items: staleJourney.length,
      purged_expenses: staleExpenses.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}