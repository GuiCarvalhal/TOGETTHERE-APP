import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Enforces the one-family-per-user invariant for the create/join/leave paths.
// A user may belong to exactly one Family (as owner or member). This function
// is the only path that creates a family or adds a member, so the invariant
// holds even if the client is bypassed. Existing RLS permission checks are
// mirrored here (owner-only for add_member) and not loosened; leave is a new
// self-service path that only removes the caller's own id (a member can't
// update a family under RLS, so this must be server-side).
//
// Actions:
//   create     { name, member_user_ids? }   -> family owned by caller; caller
//                                             AND every listed member must be
//                                             family-less.
//   add_member { family_id, user_id }       -> owner-only; target must be
//                                             family-less.
//   leave      { family_id }                -> caller (a member) removes self;
//                                             owner must delete instead.
//
// Pre-existing duplicate memberships are never auto-fixed: if a user is
// already in more than one family, create/add are rejected with a clear error
// rather than silently merging, moving, or deleting records.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    // Load all families (service role) to evaluate membership. Family records
    // are small and few; a full list is acceptable here.
    const allFams = await base44.asServiceRole.entities.Family.list().catch(() => []);
    const familiesOf = (uid) =>
      (allFams || []).filter((f) => f.owner_user_id === uid || (f.member_user_ids || []).includes(uid));

    if (action === 'create') {
      const name = (body.name || '').trim();
      if (!name) return Response.json({ error: 'A family name is required.' }, { status: 400 });
      const memberIds = Array.isArray(body.member_user_ids)
        ? body.member_user_ids.filter(Boolean)
        : [];

      const mine = familiesOf(user.id);
      if (mine.length > 0) {
        return Response.json(
          { error: 'You already belong to a family. You can only have one.' },
          { status: 409 }
        );
      }
      for (const uid of memberIds) {
        if (uid === user.id) continue; // caller becomes the owner
        if (familiesOf(uid).length > 0) {
          return Response.json(
            { error: 'A member you selected already belongs to a family. Remove them from it first.' },
            { status: 409 }
          );
        }
      }
      const created = await base44.asServiceRole.entities.Family.create({
        name,
        owner_user_id: user.id,
        member_user_ids: memberIds,
      });
      return Response.json({
        family: {
          id: created.id,
          name: created.name,
          owner_user_id: created.owner_user_id,
          member_user_ids: created.member_user_ids || [],
        },
      });
    }

    if (action === 'add_member') {
      const { family_id, user_id } = body;
      if (!family_id || !user_id) {
        return Response.json({ error: 'family_id and user_id are required.' }, { status: 400 });
      }
      const fam = (allFams || []).find((f) => f.id === family_id);
      if (!fam) return Response.json({ error: 'Family not found.' }, { status: 404 });
      if (fam.owner_user_id !== user.id) {
        return Response.json({ error: 'Only the family owner can add members.' }, { status: 403 });
      }
      if (user_id === user.id) {
        return Response.json({ error: 'You already own this family.' }, { status: 400 });
      }
      if (familiesOf(user_id).length > 0) {
        return Response.json(
          { error: 'That person already belongs to a family. Remove them from it first.' },
          { status: 409 }
        );
      }
      const members = fam.member_user_ids || [];
      if (members.includes(user_id)) {
        return Response.json({
          family: { id: fam.id, name: fam.name, owner_user_id: fam.owner_user_id, member_user_ids: members },
        });
      }
      const updated = await base44.asServiceRole.entities.Family.update(family_id, {
        member_user_ids: [...members, user_id],
      });
      return Response.json({
        family: {
          id: updated.id,
          name: updated.name,
          owner_user_id: updated.owner_user_id,
          member_user_ids: updated.member_user_ids || [],
        },
      });
    }

    if (action === 'leave') {
      const { family_id } = body;
      if (!family_id) return Response.json({ error: 'family_id is required.' }, { status: 400 });
      const fam = (allFams || []).find((f) => f.id === family_id);
      if (!fam) return Response.json({ error: 'Family not found.' }, { status: 404 });
      if (fam.owner_user_id === user.id) {
        return Response.json({ error: 'As the owner, delete the family to leave it.' }, { status: 400 });
      }
      const members = fam.member_user_ids || [];
      if (!members.includes(user.id)) {
        return Response.json({ error: 'You are not a member of this family.' }, { status: 400 });
      }
      const updated = await base44.asServiceRole.entities.Family.update(family_id, {
        member_user_ids: members.filter((uid) => uid !== user.id),
      });
      return Response.json({
        family: {
          id: updated.id,
          name: updated.name,
          owner_user_id: updated.owner_user_id,
          member_user_ids: updated.member_user_ids || [],
        },
      });
    }

    return Response.json({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}