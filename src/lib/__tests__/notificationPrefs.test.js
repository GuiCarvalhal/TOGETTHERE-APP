import { describe, it, expect } from 'vitest';
import {
  aggregatePrefs,
  beginToggle,
  categoryLocked,
  isSwitchOn,
  mergeMemberships,
  revertToggle,
  NOTIFY_DEFAULTS,
} from '@/lib/notificationPrefs';

// Account-wide preferences are the AND of every membership the user holds, so
// the screen needs one deterministic value per switch, an optimistic update,
// and an exact rollback when the write fails.

describe('mergeMemberships', () => {
  const user = { id: 'u1', email: 'Ana@Example.com' };

  it('keeps id-keyed and email-keyed rows and drops duplicates', () => {
    const byId = [{ id: 'm1', user_id: 'u1', email: 'ana@example.com' }];
    const byEmail = [{ id: 'm1', user_id: 'u1' }, { id: 'm2', user_id: 'pending-ana@example.com', email: 'ana@example.com' }];
    const rows = mergeMemberships({ byId, byEmail }, user.id, user.email);
    expect(rows.map((r) => r.id)).toEqual(['m1', 'm2']);
  });

  it('never picks up a row claimed by another user', () => {
    const rows = mergeMemberships({ byEmail: [{ id: 'm9', user_id: 'u2', email: 'ana@example.com' }] }, user.id, user.email);
    expect(rows).toEqual([]);
  });

  it('ignores rows with no email match', () => {
    const rows = mergeMemberships({ byId: [{ id: 'm3', user_id: 'u1', email: 'other@example.com' }] }, user.id, user.email);
    expect(rows.map((r) => r.id)).toEqual(['m3']);
  });
});

describe('aggregatePrefs', () => {
  it('defaults to everything on with no memberships', () => {
    expect(aggregatePrefs([])).toEqual(NOTIFY_DEFAULTS);
    expect(aggregatePrefs(null)).toEqual(NOTIFY_DEFAULTS);
  });

  it('counts an absent flag as on', () => {
    expect(aggregatePrefs([{ id: 'a' }, { id: 'b', notify_journey: undefined }]).notify_journey).toBe(true);
  });

  it('is on only when the flag is on in every membership', () => {
    const rows = [{ id: 'a', notify_expenses: true }, { id: 'b', notify_expenses: false }];
    expect(aggregatePrefs(rows).notify_expenses).toBe(false);
  });

  it('keeps categories independent of each other', () => {
    const prefs = aggregatePrefs([{ id: 'a', notify_master: false, notify_ai: true }]);
    expect(prefs.notify_master).toBe(false);
    expect(prefs.notify_ai).toBe(true);
  });
});

describe('master switch determinism', () => {
  it('locks categories while the master is off', () => {
    expect(categoryLocked({ notify_master: false })).toBe(true);
    expect(categoryLocked({ notify_master: true })).toBe(false);
    expect(categoryLocked(null)).toBe(true);
  });

  it('renders every category off while the master is off, whatever is stored', () => {
    const prefs = { notify_master: false, notify_journey: true, notify_ai: true };
    expect(isSwitchOn(prefs, 'notify_journey')).toBe(false);
    expect(isSwitchOn(prefs, 'notify_master')).toBe(false);
  });

  it('restores the stored category values when the master comes back on', () => {
    const prefs = { notify_master: true, notify_journey: true, notify_ai: false };
    expect(isSwitchOn(prefs, 'notify_journey')).toBe(true);
    expect(isSwitchOn(prefs, 'notify_ai')).toBe(false);
  });
});

describe('optimistic toggle and rollback', () => {
  it('applies the new value immediately and hands back the previous one', () => {
    const { next, previous } = beginToggle({ notify_master: true, notify_journey: true }, 'notify_journey', false);
    expect(next.notify_journey).toBe(false);
    expect(previous).toBe(true);
  });

  it('rolls back to the previous value on failure', () => {
    const { next, previous } = beginToggle({ notify_master: true, notify_journey: true }, 'notify_journey', false);
    expect(revertToggle(next, 'notify_journey', previous).notify_journey).toBe(true);
  });

  it('rolls back a failed enable to off', () => {
    const { next, previous } = beginToggle({ notify_master: true, notify_ai: false }, 'notify_ai', true);
    expect(next.notify_ai).toBe(true);
    expect(revertToggle(next, 'notify_ai', previous).notify_ai).toBe(false);
  });

  it('removes the key again when it had no stored value', () => {
    const { next, previous } = beginToggle({ notify_master: true }, 'notify_members', false);
    expect(previous).toBeUndefined();
    expect('notify_members' in revertToggle(next, 'notify_members', previous)).toBe(false);
  });

  it('does not disturb the other switches while rolling back', () => {
    const { next, previous } = beginToggle({ notify_master: true, notify_journey: true, notify_ai: false }, 'notify_journey', false);
    const reverted = revertToggle(next, 'notify_journey', previous);
    expect(reverted).toEqual({ notify_master: true, notify_journey: true, notify_ai: false });
  });
});