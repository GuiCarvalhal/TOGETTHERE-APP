// Shared soft-delete contract for recoverable items (JourneyItem, Expense).
//
// Deleting never removes the row on the first pass: it is flagged with
// is_deleted + deleted_at + deleted_by and hidden from normal reads. Restoring
// simply clears those flags, so the record returns with its original dates,
// gathering links, splits and permissions intact — nothing is re-created.
//
// A retained item stays restorable for SOFT_DELETE_RETENTION_DAYS, after which
// purgeDeletedItems may remove it permanently.

export const SOFT_DELETE_RETENTION_DAYS = 30;

export const SOFT_DELETE_FLAGS = ['is_deleted', 'deleted_at', 'deleted_by'];

export function softDeletePatch(userId?: string | null) {
  return {
    is_deleted: true,
    deleted_at: new Date().toISOString(),
    deleted_by: userId || null,
  };
}

export function restorePatch() {
  return {
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  };
}

// True only for records that were soft-deleted longer ago than the retention
// window. Records without a parseable deleted_at are never purged automatically.
export function isPurgeable(record: any, nowMs: number = Date.now()): boolean {
  if (!record || record.is_deleted !== true) return false;
  const ts = Date.parse(record.deleted_at || '');
  if (!Number.isFinite(ts)) return false;
  return nowMs - ts > SOFT_DELETE_RETENTION_DAYS * 86400000;
}