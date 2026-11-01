// iCloud app-password key ring: round-trip, rotation window, rotated-away key,
// missing key material, pre-fingerprint records and malformed ciphertext. No
// network and no real credentials — only placeholder key material.
//
// Shared modules cannot import `vitest` (they are bundled into backend
// functions), so this follows the same `globalThis` convention as the other
// shared tests.
const { test } = globalThis;
import assert from 'node:assert/strict';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import {
  encryptImapCredential,
  imapCredentialsAvailable,
  readImapCredential,
} from './imapInbox.ts';

const ENV_KEYS = ['INBOX_CREDENTIALS_KEY', 'INBOX_CREDENTIALS_KEY_PREVIOUS', 'RESERVATION_INBOX_TOKEN'];
const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function setEnv(values) {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value;
}

function resetEnv() {
  for (const key of ENV_KEYS) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
}

// A record in the OLD format (no key fingerprint), exactly as the previous
// release wrote it: AES-256-GCM over SHA-256(key material), ciphertext||tag.
function encryptLegacy(material, plain) {
  const key = createHash('sha256').update(material).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final(), cipher.getAuthTag()]);
  return `v1:${iv.toString('base64')}:${body.toString('base64')}`;
}

test('credential key ring: tags new ciphertext with the dedicated key and round-trips', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'dedicated-key-a' });
  const stored = await encryptImapCredential('abcd-efgh-ijkl-mnop');

  assert.ok(stored.startsWith('v2:'), 'new records carry a key fingerprint');
  assert.ok(!stored.includes('abcd'), 'ciphertext never contains the plaintext');

  const read = await readImapCredential(stored);
  assert.equal(read.value, 'abcd-efgh-ijkl-mnop');
  assert.equal(read.needsRotation, false);
  resetEnv();
});

test('credential key ring: reads the previous key during a rotation window and re-encrypts', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'old-key' });
  const stored = await encryptImapCredential('app-pass-1');

  setEnv({ INBOX_CREDENTIALS_KEY: 'new-key', INBOX_CREDENTIALS_KEY_PREVIOUS: 'old-key' });
  const read = await readImapCredential(stored);
  assert.equal(read.value, 'app-pass-1', 'the outgoing key still decrypts');
  assert.equal(read.needsRotation, true, 'rotation is requested');

  const rotated = await encryptImapCredential(read.value);
  const after = await readImapCredential(rotated);
  assert.equal(after.value, 'app-pass-1');
  assert.equal(after.needsRotation, false, 'rotation is complete');
  resetEnv();
});

test('credential key ring: prefers the dedicated key over the legacy token', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'dedicated', RESERVATION_INBOX_TOKEN: 'legacy-token' });
  const stored = await encryptImapCredential('app-pass-2');
  assert.equal((await readImapCredential(stored)).needsRotation, false);

  // With the dedicated key removed, the legacy token cannot read the record.
  setEnv({ RESERVATION_INBOX_TOKEN: 'legacy-token' });
  await assert.rejects(() => readImapCredential(stored), /credentials_key_invalid/);
  resetEnv();
});

test('credential key ring: clear code when the writing key is gone', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'old-key' });
  const stored = await encryptImapCredential('app-pass-3');

  setEnv({ INBOX_CREDENTIALS_KEY: 'brand-new-key' });
  await assert.rejects(() => readImapCredential(stored), /credentials_key_invalid/);
  resetEnv();
});

test('credential key ring: clear code when no key material exists', async () => {
  setEnv({});
  assert.equal(imapCredentialsAvailable(), false);
  await assert.rejects(() => encryptImapCredential('x'), /credentials_key_missing/);
  resetEnv();
});

test('credential key ring: reads pre-fingerprint v1 records through the ring', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'dedicated', RESERVATION_INBOX_TOKEN: 'legacy-token' });
  const read = await readImapCredential(encryptLegacy('legacy-token', 'old-pass'));

  assert.equal(read.value, 'old-pass');
  // Written by the legacy key, so it should migrate to the dedicated one.
  assert.equal(read.needsRotation, true);
  resetEnv();
});

test('credential key ring: empty and malformed values count as "nothing stored"', async () => {
  setEnv({ INBOX_CREDENTIALS_KEY: 'dedicated-key-a' });
  assert.deepEqual(await readImapCredential(''), { value: '', needsRotation: false });
  assert.deepEqual(await readImapCredential('not-a-ciphertext'), { value: '', needsRotation: false });
  assert.deepEqual(await readImapCredential('v2:only:two'), { value: '', needsRotation: false });
  resetEnv();
});