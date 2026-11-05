import { describe, it, expect } from 'vitest';
import {
  SOFT_DELETE_RETENTION_DAYS,
  activeRecords,
  daysLeftToRestore,
  isDeleted,
  restoreFields,
  softDeleteFields,
} from '@/lib/softDelete';

// Recoverable deletes: a delete flags the row instead of removing it, normal
// reads drop the flagged rows (but never legacy rows that simply have no flag),
// and a restore clears the flags so the item returns exactly where it was.
describe('soft delete helpers', () => {
  const legacy = { id: 'legacy', title: 'No flag at all' };
  const live = { id: 'live', title: 'Live', is_deleted: false };
  const gone = { id: 'gone', title: 'Deleted', is_deleted: true, deleted_at: '2026-01-01T00:00:00.000Z' };

  it('flags a delete without removing data', () => {
    const patch = softDeleteFields('user-1');
    expect(patch.is_deleted).toBe(true);
    expect(patch.deleted_by).toBe('user-1');
    expect(Number.isFinite(Date.parse(patch.deleted_at))).toBe(true);
  });

  it('clears every flag on restore', () => {
    expect(restoreFields()).toEqual({ is_deleted: false, deleted_at: null, deleted_by: null });
  });

  it('excludes soft-deleted rows but keeps legacy rows', () => {
    expect(activeRecords([legacy, live, gone]).map((r) => r.id)).toEqual(['legacy', 'live']);
    expect(isDeleted(legacy)).toBe(false);
    expect(isDeleted(gone)).toBe(true);
  });

  it('tolerates a missing list', () => {
    expect(activeRecords(undefined)).toEqual([]);
  });

  it('counts down the restore window', () => {
    const deletedAt = '2026-01-01T00:00:00.000Z';
    const day = 86400000;
    expect(daysLeftToRestore(deletedAt, Date.parse(deletedAt))).toBe(SOFT_DELETE_RETENTION_DAYS);
    expect(daysLeftToRestore(deletedAt, Date.parse(deletedAt) + 10 * day)).toBe(SOFT_DELETE_RETENTION_DAYS - 10);
    // Never negative, even long past retention.
    expect(daysLeftToRestore(deletedAt, Date.parse(deletedAt) + 90 * day)).toBe(0);
  });
});