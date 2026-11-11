import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { getMyMember } from '../../shared/gatheringAcl.ts';
import { resolvePastContacts } from '../../shared/pastMembers.ts';

// Candidates for "People from previous gatherings": accounts the current user has
// traveled with before, minus anyone already in this gathering (by account id or
// by email, which also covers legacy rows whose user_id was an email address).
// Owners and admins only — the list exists to add members.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { gathering_id } = body;
    if (!gathering_id) return Response.json({ error: 'gathering_id required' }, { status: 400 });

    const me = await getMyMember(base44, gathering_id, user.id);
    if (!me || (me.role !== 'owner' && me.role !== 'admin')) {
      return Response.json({ error: 'Only the owner or an admin can add members' }, { status: 403 });
    }

    const [contacts, currentMembers] = await Promise.all([
      resolvePastContacts(base44, user.id, { includeSharedGatherings: true }),
      base44.asServiceRole.entities.Member.filter({ gathering_id }).catch(() => []),
    ]);

    const takenUids = new Set((currentMembers || []).map((m) => (m.user_id || '').trim()));
    const takenEmails = new Set(
      (currentMembers || []).map((m) => (m.email || '').trim().toLowerCase()).filter(Boolean)
    );

    const candidates = (contacts || [])
      .filter((c) => !takenUids.has(c.user_id) && !(c.email && takenEmails.has(c.email)))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

    return Response.json({ candidates });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}