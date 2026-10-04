// Tests for the OneSignal push helper: request shape (exact body + auth header
// sent to the OneSignal REST API), recipient filtering (who is eligible per
// category/role/prefs), and API error handling (non-ok + network failures
// return structured results without throwing). No real API calls are made —
// globalThis.fetch is stubbed. No secret values are asserted; only test
// placeholders. The dedup map is module-level; each test uses a unique dedupKey.
const { test } = globalThis;
import assert from 'node:assert/strict';
import { sendToUsers, memberEligibleForCategory } from './onesignal.ts';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const origEnv = { ...process.env };
const origFetch = globalThis.fetch;

function setConfig(restKey, appId) {
  if (restKey) process.env.OneSignal_Rest_API = restKey; else delete process.env.OneSignal_Rest_API;
  if (appId) process.env.OneSignal_AppID = appId; else delete process.env.OneSignal_AppID;
}
function restore() {
  globalThis.fetch = origFetch;
  for (const k of Object.keys(process.env)) if (!(k in origEnv)) delete process.env[k];
  for (const k of Object.keys(origEnv)) process.env[k] = origEnv[k];
}

// ---- memberEligibleForCategory: recipient filtering ----

test('memberEligibleForCategory: allows member with prefs on', () => {
  const m = { notify_master: true, notify_journey: true, role: 'member' };
  assert.equal(memberEligibleForCategory(m, { category: 'journey', prefKey: 'notify_journey' }), true);
});
test('memberEligibleForCategory: excludes when master off', () => {
  const m = { notify_master: false, notify_journey: true, role: 'member' };
  assert.equal(memberEligibleForCategory(m, { category: 'journey', prefKey: 'notify_journey' }), false);
});
test('memberEligibleForCategory: excludes when category pref off', () => {
  const m = { notify_master: true, notify_journey: false, role: 'member' };
  assert.equal(memberEligibleForCategory(m, { category: 'journey', prefKey: 'notify_journey' }), false);
});
test('memberEligibleForCategory: excludes viewers from expenses', () => {
  const m = { notify_master: true, notify_expenses: true, role: 'viewer' };
  assert.equal(memberEligibleForCategory(m, { category: 'expenses', prefKey: 'notify_expenses' }), false);
});
test('memberEligibleForCategory: allows viewer for non-expenses by default (targeted)', () => {
  const m = { notify_master: true, notify_journey: true, role: 'viewer' };
  assert.equal(memberEligibleForCategory(m, { category: 'journey', prefKey: 'notify_journey' }), true);
});
test('memberEligibleForCategory: excludes viewer when includeViewers false (broadcast)', () => {
  const m = { notify_master: true, notify_journey: true, role: 'viewer' };
  assert.equal(memberEligibleForCategory(m, { category: 'journey', prefKey: 'notify_journey', includeViewers: false }), false);
});
test('memberEligibleForCategory: false for null member', () => {
  assert.equal(memberEligibleForCategory(null, { category: 'journey', prefKey: 'notify_journey' }), false);
});
test('memberEligibleForCategory: skips pref check when prefKey absent', () => {
  const m = { notify_master: true, notify_journey: false, role: 'member' };
  assert.equal(memberEligibleForCategory(m, { category: 'reminders' }), true);
});

// ---- sendToUsers: request shape + auth ----

test('sendToUsers: posts to current OneSignal endpoint with app_id, include_aliases external_id, target_channel push, Key auth', async () => {
  setConfig('test-rest-key', 'test-app-id');
  let captured = null;
  globalThis.fetch = async (url, init) => { captured = { url, init }; return json({ id: 'n1', recipients: 2 }); };
  try {
    const result = await sendToUsers({
      externalUserIds: ['u1', 'u2'], heading: 'Test', message: 'Hello',
      data: { route: '/x' }, url: 'https://app/x', dedupKey: 'shape-1',
    });
    assert.equal(result.ok, true);
    assert.equal(result.sent, 2);
    assert.equal(captured.url, 'https://api.onesignal.com/notifications');
    assert.equal(captured.init.method, 'POST');
    assert.equal(captured.init.headers['Content-Type'], 'application/json');
    assert.equal(captured.init.headers.Authorization, 'Key test-rest-key');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.app_id, 'test-app-id');
    assert.deepEqual(body.include_aliases, { external_id: ['u1', 'u2'] });
    assert.equal(body.target_channel, 'push');
    assert.equal(body.include_external_user_ids, undefined);
    assert.equal(body.headings.en, 'Test');
    assert.equal(body.contents.en, 'Hello');
    assert.deepEqual(body.data, { route: '/x' });
    assert.equal(body.url, 'https://app/x');
  } finally { restore(); }
});

test('sendToUsers: defaults heading to TOGETTHERE and omits url', async () => {
  setConfig('test-rest-key', 'test-app-id');
  let captured = null;
  globalThis.fetch = async (url, init) => { captured = { url, init }; return json({ id: 'n2', recipients: 1 }); };
  try {
    await sendToUsers({ externalUserIds: ['u1'], message: 'M', dedupKey: 'shape-2' });
    const body = JSON.parse(captured.init.body);
    assert.equal(body.headings.en, 'TOGETTHERE');
    assert.equal(body.url, undefined);
    assert.deepEqual(body.include_aliases, { external_id: ['u1'] });
    assert.equal(body.target_channel, 'push');
  } finally { restore(); }
});

test('sendToUsers: 200 with falsy id (no eligible subscribers) reports not-sent', async () => {
  setConfig('test-rest-key', 'test-app-id');
  globalThis.fetch = async () => json({ id: '', errors: ['No eligible subscribers for this notification'] }, 200);
  try {
    const result = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'nosub-1' });
    assert.equal(result.ok, false);
    assert.equal(result.sent, 0);
    assert.equal(result.error, 'No eligible subscribers');
  } finally { restore(); }
});

// ---- sendToUsers: API error handling ----

test('sendToUsers: structured error on 401 without throwing', async () => {
  setConfig('test-rest-key', 'test-app-id');
  globalThis.fetch = async () => json({ errors: ['Invalid key'] }, 401);
  try {
    const result = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'err-1' });
    assert.equal(result.ok, false);
    assert.equal(result.sent, 0);
    assert.equal(result.status, 401);
    assert.equal(result.error, 'Invalid key');
  } finally { restore(); }
});

test('sendToUsers: structured error on network failure without throwing', async () => {
  setConfig('test-rest-key', 'test-app-id');
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const result = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'net-1' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'offline');
  } finally { restore(); }
});

test('sendToUsers: status-coded fallback when error body has no message', async () => {
  setConfig('test-rest-key', 'test-app-id');
  globalThis.fetch = async () => json({}, 500);
  try {
    const result = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'err-2' });
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.ok(result.error.includes('500'));
  } finally { restore(); }
});

// ---- sendToUsers: guard paths ----

test('sendToUsers: not-configured when REST key missing, no fetch', async () => {
  setConfig('', 'test-app-id');
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  try {
    const result = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'OneSignal is not configured');
    assert.equal(called, false);
  } finally { restore(); }
});

test('sendToUsers: no_recipients for empty or all-null user ids, no fetch', async () => {
  setConfig('test-rest-key', 'test-app-id');
  let called = false;
  globalThis.fetch = async () => { called = true; return json({}); };
  try {
    const r1 = await sendToUsers({ externalUserIds: [], heading: 'H', message: 'M' });
    assert.equal(r1.ok, true);
    assert.equal(r1.reason, 'no_recipients');
    const r2 = await sendToUsers({ externalUserIds: [null, ''], heading: 'H', message: 'M' });
    assert.equal(r2.ok, true);
    assert.equal(r2.reason, 'no_recipients');
    assert.equal(called, false);
  } finally { restore(); }
});

test('sendToUsers: deduplicates a repeated send within the window', async () => {
  setConfig('test-rest-key', 'test-app-id');
  let calls = 0;
  globalThis.fetch = async () => { calls++; return json({ id: 'n', recipients: 1 }); };
  try {
    const r1 = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'dedup-1' });
    const r2 = await sendToUsers({ externalUserIds: ['u1'], heading: 'H', message: 'M', dedupKey: 'dedup-1' });
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r2.reason, 'deduplicated');
    assert.equal(calls, 1);
  } finally { restore(); }
});