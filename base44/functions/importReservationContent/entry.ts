import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { extractJourneyDrafts } from '../../shared/extractJourneyDraft.ts';
import { adaptReservationDraft } from '../../shared/journeyFormAdapter.ts';
import { uploadSourceEmail } from '../../shared/reservationAttachment.ts';
import { createInboxItem } from '../../shared/journeyInbox.ts';

// Manual booking import: pasted text or an uploaded file.
//
// Same pipeline as the mailbox connectors — the content is split into every
// booking it describes, each segment is adapted to the standard item payload and
// stored in the user's journey inbox with the FULL email attached. From there the
// user files each segment into a gathering (fileJourneyInboxItem), so a segment
// that is not used right away is never lost.

const MAX_CONTENT = 20000;
const MAX_SEGMENTS = 8;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const subject = text(body?.subject) || text(body?.file_name) || 'Imported reservation';

    // Content arrives either as text the browser could read (paste, .eml, .txt)
    // or as a PDF / screenshot it cannot (file_url: a short-lived signed URL).
    // For those the document is transcribed first, then the exact same pipeline
    // runs — one importer for every entry point, inbox included.
    let content = text(body?.text);
    if (!content) {
      const fileUrl = text(body?.file_url);
      if (!fileUrl) return Response.json({ error: 'Reservation content is required' }, { status: 400 });
      const extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt:
          'Transcribe this travel booking document as plain text. Return every confirmation, booking code, ' +
          'flight number, date, time, airport, station, hotel and guest detail exactly as printed, in reading ' +
          'order, with no commentary and no markdown. If the document contains no travel booking, return an ' +
          'empty string.',
        file_urls: [fileUrl],
      });
      content = text(typeof extracted === 'string' ? extracted : '');
      if (!content) {
        return Response.json({ error: 'No travel segment found in this content', segmented: true }, { status: 422 });
      }
    }
    if (content.length > MAX_CONTENT) {
      return Response.json({ error: 'Reservation content is too long' }, { status: 400 });
    }

    const receivedAt = new Date().toISOString();

    const drafts = (await extractJourneyDrafts(base44, content, subject)).slice(0, MAX_SEGMENTS);
    if (!drafts.length) {
      return Response.json({ error: 'No travel segment found in this content', segmented: true }, { status: 422 });
    }

    const emailFileUri = await uploadSourceEmail(base44, {
      subject,
      sender: user.email || '',
      recipient: user.email || '',
      receivedAt,
      text: content,
    });

    const items = [];
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = {
        ...drafts[index],
        attachments: emailFileUri ? [emailFileUri] : [],
      };
      const fallbackTitle = drafts.length > 1 ? `${subject} (${index + 1}/${drafts.length})` : subject;
      const adapted = await adaptReservationDraft(draft, fallbackTitle);
      const row = await createInboxItem(base44, {
        payload: adapted.payload,
        ownerUserId: user.id,
        ownerEmail: user.email || '',
        missing: adapted.missing,
        source: 'manual',
        sourceSubject: subject,
        sourceSender: user.email || '',
        sourceReceivedAt: receivedAt,
        sourceContent: content,
      });
      items.push({ ...row, missing: adapted.missing });
    }

    return Response.json({ items, count: items.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}