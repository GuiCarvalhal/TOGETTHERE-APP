// Shared helpers for writing a user's notification preferences to EVERY
// gathering membership they hold. Dependency-free so the function and its Deno
// test can both import it.
//
// Why this is not a single updateMany: updateMany reports has_more once it has
// written a batch, but our query (user id / email) still matches those same rows
// afterwards, so looping on has_more never terminates. Reading the rows and
// bulk-updating them by id is idempotent and finishes in one pass.

export const NOTIFY_KEYS = [
  'notify_master',
  'notify_journey',
  'notify_expenses',
  'notify_members',
  'notify_reminders',
  'notify_ai',
];

export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

// Whitelist the fields a client may write, coerced to booleans.
export function buildPrefsUpdate(fields: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const update: Record<string, boolean> = {};
  if (!fields || typeof fields !== 'object') return update;
  for (const key of NOTIFY_KEYS) {
    if (key in (fields as Record<string, unknown>)) {
      update[key] = Boolean((fields as Record<string, unknown>)[key]);
    }
  }
  return update;
}

// A membership row is this user's when it carries their user id, or when it is
// still an unclaimed placeholder that carries their email. A row already claimed
// by somebody else is never matched by email.
export function rowBelongsToUser(row: any, userId: string, email?: string | null): boolean {
  if (!row) return false;
  const uid = typeof row.user_id === 'string' ? row.user_id : '';
  if (uid && uid === userId) return true;
  if (uid && !uid.startsWith('pending-')) return false;
  const mail = normalizeEmail(email);
  return Boolean(mail) && normalizeEmail(row.email) === mail;
}

export function collectUserMemberships(rows: any[], userId: string, email?: string | null): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of rows || []) {
    if (!row?.id || seen.has(row.id)) continue;
    if (!rowBelongsToUser(row, userId, email)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

// Query the id first, then the email in the shapes a row can actually hold it
// (as typed and lowercased), so a differently-cased legacy row is still found.
export function membershipQueries(userId: string, email?: string | null): any[] {
  const queries: any[] = [{ user_id: userId }];
  const raw = typeof email === 'string' ? email.trim() : '';
  const mail = normalizeEmail(email);
  if (raw) queries.push({ email: raw });
  if (mail && mail !== raw) queries.push({ email: mail });
  return queries;
}

export async function applyPrefsToAllMemberships(
  base44: any,
  { userId, email, update, chunkSize = 200 }: { userId: string; email?: string | null; update: Record<string, boolean>; chunkSize?: number },
): Promise<{ matched: number; updated: number }> {
  const found: any[] = [];
  for (const query of membershipQueries(userId, email)) {
    const rows = await base44.asServiceRole.entities.Member.filter(query);
    const list = Array.isArray(rows) ? rows : (rows?.items || []);
    found.push(...list);
  }

  const rows = collectUserMemberships(found, userId, email);
  const size = Math.max(1, Number(chunkSize) || 200);
  let updated = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size).map((row) => ({ id: row.id, ...update }));
    await base44.asServiceRole.entities.Member.bulkUpdate(batch);
    updated += batch.length;
  }
  return { matched: rows.length, updated };
}