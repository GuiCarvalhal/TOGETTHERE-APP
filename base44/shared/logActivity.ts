// Lightweight activity logging for the in-app feed.
// Non-fatal: swallows errors so a logging failure never breaks the parent action.
export async function logActivity(base44, opts) {
  try {
    await base44.asServiceRole.entities.Activity.create({
      gathering_id: opts.gatheringId,
      type: opts.type,
      actor_user_id: opts.actorUserId || '',
      actor_name: opts.actorName || 'Someone',
      summary: opts.summary,
      meta: opts.meta || {},
      owner_user_id: opts.ownerUserId || '',
      participant_user_ids: opts.participantUserIds || [],
    });
  } catch (e) {
    // non-fatal
  }
}