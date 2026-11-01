import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { extractJourneyDraft } from '../../shared/extractJourneyDraft.ts';

// Extracts ONE travel-segment draft from booking content provided by the user.
// Input can be email text or any other plain-text reservation content. Uses the
// built-in InvokeLLM (Core) with a JSON schema matching JourneyItem fields.
// Does NOT connect to inboxes/accounts, does NOT persist raw text, and does
// NOT create any record ??? it only returns a draft for user review. The caller
// page is what creates the segment via createJourneyItem after confirmation.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === 'string' ? body.text : '';
    if (!text.trim()) return Response.json({ error: 'Reservation content is required' }, { status: 400 });
    if (text.length > 20000) return Response.json({ error: 'Reservation content is too long' }, { status: 400 });
    const draft = await extractJourneyDraft(base44, text);
    return Response.json({ draft });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
