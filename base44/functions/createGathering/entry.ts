import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const { name, description, start_date, end_date, destinations, cover_image } = body;
    if (!name) return Response.json({ error: 'name required' }, { status: 400 });

    const gathering = await base44.asServiceRole.entities.Gathering.create({
      name,
      description: description || '',
      start_date: start_date || undefined,
      end_date: end_date || undefined,
      destinations: destinations || [],
      cover_image: cover_image || '',
      privacy_mode: 'invite',
      status: 'planning',
      owner_user_id: user.id,
      member_user_ids: [user.id],
      participant_user_ids: [user.id],
    });
    await base44.asServiceRole.entities.Member.create({
      gathering_id: gathering.id,
      user_id: user.id,
      role: 'owner',
      full_name: user.full_name || (user.email ? user.email.split('@')[0] : 'Organizer'),
      owner_user_id: user.id,
    });
    return Response.json({ gathering });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}