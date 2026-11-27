import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { buildPrefsUpdate, applyPrefsToAllMemberships } from '../../shared/notificationPrefs.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { gathering_id, fields, scope } = body;

    const update = buildPrefsUpdate(fields);
    if (!Object.keys(update).length) return Response.json({ error: 'No updatable fields' }, { status: 400 });

    // scope "all" = one switch for the user in EVERY gathering (used by the
    // Account preferences area). Every membership row that is theirs is written
    // in one pass — by user id, plus the still-unclaimed invite rows that carry
    // their email — and the counts come back so the client can verify.
    if (scope === 'all') {
      const result = await applyPrefsToAllMemberships(base44, { userId: user.id, email: user.email, update });
      return Response.json({ ok: true, scope: 'all', ...result });
    }

    if (!gathering_id) return Response.json({ error: 'gathering_id and fields required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me) return Response.json({ error: 'Not a member' }, { status: 403 });

    await base44.asServiceRole.entities.Member.update(me.id, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}