import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

// Adds, moves or removes ONE country in the caller's passport.
//   { action: 'set',    code: 'IT', status: 'visited' | 'bucket' }
//   { action: 'remove', code: 'IT' }
// Only the user's own rows are touched: the record is looked up by the read-ACL
// keys of the caller, so a code alone can never reach someone else's passport.
const ISO2 = /^[A-Z]{2}$/;
const STATUSES = ['visited', 'bucket'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e: any) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action === 'remove' ? 'remove' : 'set';
    const code = String(body?.code || '').trim().toUpperCase();
    const status = STATUSES.includes(body?.status) ? body.status : 'visited';
    if (!ISO2.test(code)) return Response.json({ error: 'A valid country code is required' }, { status: 400 });

    const svc = base44.asServiceRole.entities;
    const email = String(user.email || '').trim().toLowerCase();
    const keys = [user.id, email].filter(Boolean);

    const existing = await svc
      .PassportCountry.filter({ country_code: code, target_user_keys: { $in: keys } })
      .catch(() => []);
    const row = (existing || [])[0];

    if (action === 'remove') {
      if (row?.id) await svc.PassportCountry.delete(row.id);
      return Response.json({ ok: true, code, status: null });
    }

    if (row?.id) {
      if (row.status !== status) await svc.PassportCountry.update(row.id, { status });
    } else {
      await svc.PassportCountry.create({ country_code: code, status, target_user_keys: keys });
    }
    return Response.json({ ok: true, code, status });
  } catch (error: any) {
    return Response.json({ error: error.message || 'Could not update the passport' }, { status: 500 });
  }
}