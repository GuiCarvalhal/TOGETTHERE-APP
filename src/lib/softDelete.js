// Frontend half of the recoverable-delete contract (see base44/shared/softDelete.ts).
// A delete flags the record instead of removing it, every normal read filters
// the flags out, and a restore clears them — so the item comes back exactly
// where it was (same id, dates, gathering, splits).

export const SOFT_DELETE_RETENTION_DAYS = 30;

export const isDeleted = (record) => record?.is_deleted === true;

// Excludes soft-deleted rows from an already-loaded list. Legacy rows have no
// is_deleted field at all, so they must stay visible — never filter for
// `is_deleted === false`.
export const activeRecords = (list) => (Array.isArray(list) ? list.filter((r) => !isDeleted(r)) : []);

export const softDeleteFields = (userId) => ({
  is_deleted: true,
  deleted_at: new Date().toISOString(),
  deleted_by: userId || null,
});

export const restoreFields = () => ({
  is_deleted: false,
  deleted_at: null,
  deleted_by: null,
});

const DAY_MS = 86400000;

// Whole days left before the cleanup job may remove this record for good.
export function daysLeftToRestore(deletedAt, nowMs = Date.now()) {
  const ts = Date.parse(deletedAt || '');
  if (!Number.isFinite(ts)) return SOFT_DELETE_RETENTION_DAYS;
  const left = SOFT_DELETE_RETENTION_DAYS - Math.floor((nowMs - ts) / DAY_MS);
  return Math.max(0, left);
}