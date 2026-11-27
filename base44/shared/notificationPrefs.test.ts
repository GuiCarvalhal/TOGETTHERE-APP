// Tests for the account-wide notification preference writer: which membership
// rows count as the user's, which queries find them, and that every one of them
// is written exactly once. No network or SDK: the client is stubbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTIFY_KEYS,
  buildPrefsUpdate,
  normalizeEmail,
  rowBelongsToUser,
  collectUserMemberships,
  membershipQueries,
  applyPrefsToAllMemberships,
} from './notificationPrefs.ts';

function stubClient(rowsByQuery: Record<string, any[]>) {
  const queries: any[] = [];
  const batches: any[][] = [];
  const client = {
    asServiceRole: {
      entities: {
        Member: {
          filter: async (query: any) => {
            queries.push(query);
            const key = query.user_id !== undefined ? query.user_id : query.email;
            return rowsByQuery[key] || [];
          },
          bulkUpdate: async (batch: any[]) => {
            batches.push(batch);
            return batch;
          },
        },
      },
    },
  };
  return { client, queries, batches };
}

// ---- field whitelist ----

test('buildPrefsUpdate: keeps only the notification flags', () => {
  const update = buildPrefsUpdate({ notify_journey: false, role: 'owner', notify_ai: true });
  assert.deepEqual(update, { notify_journey: false, notify_ai: true });
});

test('buildPrefsUpdate: coerces to booleans and ignores absent keys', () => {
  const update = buildPrefsUpdate({ notify_master: 0, notify_expenses: 'yes' });
  assert.deepEqual(update, { notify_master: false, notify_expenses: true });
});

test('buildPrefsUpdate: empty for missing or non-object fields', () => {
  assert.deepEqual(buildPrefsUpdate(null), {});
  assert.deepEqual(buildPrefsUpdate(undefined), {});
  assert.deepEqual(buildPrefsUpdate({}), {});
});

test('buildPrefsUpdate: covers every key the UI can send', () => {
  const fields = Object.fromEntries(NOTIFY_KEYS.map((key) => [key, true]));
  assert.deepEqual(Object.keys(buildPrefsUpdate(fields)).sort(), [...NOTIFY_KEYS].sort());
});

// ---- ownership rules ----

test('normalizeEmail: trims and lowercases, empty for non-strings', () => {
  assert.equal(normalizeEmail('  Ana@Example.COM '), 'ana@example.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('rowBelongsToUser: own user id always matches', () => {
  assert.equal(rowBelongsToUser({ id: 'm1', user_id: 'u1', email: 'other@x.com' }, 'u1', 'ana@x.com'), true);
});

test('rowBelongsToUser: unclaimed invite row matches by email, case-insensitively', () => {
  assert.equal(rowBelongsToUser({ id: 'm2', user_id: 'pending-ana@x.com', email: 'Ana@X.com' }, 'u1', 'ana@x.com'), true);
  assert.equal(rowBelongsToUser({ id: 'm3', email: 'ana@x.com' }, 'u1', 'ana@x.com'), true);
});

test('rowBelongsToUser: a row claimed by somebody else is never matched by email', () => {
  assert.equal(rowBelongsToUser({ id: 'm4', user_id: 'u2', email: 'ana@x.com' }, 'u1', 'ana@x.com'), false);
});

test('rowBelongsToUser: no email and no id match is false', () => {
  assert.equal(rowBelongsToUser({ id: 'm5', user_id: 'pending-x@y.com', email: 'x@y.com' }, 'u1', ''), false);
  assert.equal(rowBelongsToUser(null, 'u1', 'ana@x.com'), false);
});

test('collectUserMemberships: dedupes by id and drops foreign rows', () => {
  const rows = [
    { id: 'm1', user_id: 'u1' },
    { id: 'm1', user_id: 'u1' },
    { id: 'm2', user_id: 'pending-ana@x.com', email: 'ana@x.com' },
    { id: 'm3', user_id: 'u2', email: 'ana@x.com' },
  ];
  assert.deepEqual(collectUserMemberships(rows, 'u1', 'ana@x.com').map((r) => r.id), ['m1', 'm2']);
});

test('membershipQueries: id first, then the email as typed and lowercased', () => {
  assert.deepEqual(membershipQueries('u1', 'Ana@X.com'), [
    { user_id: 'u1' },
    { email: 'Ana@X.com' },
    { email: 'ana@x.com' },
  ]);
});

test('membershipQueries: no duplicate email query when it is already lowercase', () => {
  assert.deepEqual(membershipQueries('u1', 'ana@x.com'), [{ user_id: 'u1' }, { email: 'ana@x.com' }]);
});

test('membershipQueries: id only when there is no email', () => {
  assert.deepEqual(membershipQueries('u1', null), [{ user_id: 'u1' }]);
});

// ---- scope: all ----

test('applyPrefsToAllMemberships: writes every membership of the user, once', async () => {
  const { client, batches } = stubClient({
    u1: [{ id: 'm1', user_id: 'u1' }, { id: 'm2', user_id: 'u1' }],
    'ana@x.com': [{ id: 'm3', user_id: 'pending-ana@x.com', email: 'ana@x.com' }],
  });
  const result = await applyPrefsToAllMemberships(client, {
    userId: 'u1', email: 'ana@x.com', update: { notify_journey: false },
  });
  const written = batches.flat();
  assert.equal(result.matched, 3);
  assert.equal(result.updated, 3);
  assert.deepEqual(written.map((row) => row.id).sort(), ['m1', 'm2', 'm3']);
  assert.ok(written.every((row) => row.notify_journey === false));
});

test('applyPrefsToAllMemberships: never touches another user row found by email', async () => {
  const { client, batches } = stubClient({
    u1: [],
    'ana@x.com': [{ id: 'm9', user_id: 'u2', email: 'ana@x.com' }],
  });
  const result = await applyPrefsToAllMemberships(client, {
    userId: 'u1', email: 'ana@x.com', update: { notify_master: false },
  });
  assert.equal(result.updated, 0);
  assert.equal(batches.length, 0);
});

test('applyPrefsToAllMemberships: chunks large memberships into several writes', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ id: `m${i}`, user_id: 'u1' }));
  const { client, batches } = stubClient({ u1: rows });
  const result = await applyPrefsToAllMemberships(client, {
    userId: 'u1', email: null, update: { notify_ai: false }, chunkSize: 2,
  });
  assert.equal(result.updated, 5);
  assert.deepEqual(batches.map((b) => b.length), [2, 2, 1]);
});

test('applyPrefsToAllMemberships: a duplicate row across queries is written once', async () => {
  const row = { id: 'm1', user_id: 'u1', email: 'ana@x.com' };
  const { client, batches } = stubClient({ u1: [row], 'ana@x.com': [row] });
  const result = await applyPrefsToAllMemberships(client, {
    userId: 'u1', email: 'ana@x.com', update: { notify_members: false },
  });
  assert.equal(result.matched, 1);
  assert.equal(batches.flat().length, 1);
});

test('applyPrefsToAllMemberships: no memberships writes nothing', async () => {
  const { client, batches } = stubClient({});
  const result = await applyPrefsToAllMemberships(client, {
    userId: 'u1', email: 'ana@x.com', update: { notify_reminders: false },
  });
  assert.deepEqual(result, { matched: 0, updated: 0 });
  assert.equal(batches.length, 0);
});