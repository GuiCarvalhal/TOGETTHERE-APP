import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import { buildInboundText } from '../../shared/reservationImport.ts';
import { ingestReservationMessage, normalizeEmailLike } from '../../shared/reservationIngestion.ts';

function getToken(req: Request) {
  const bearer = req.headers.get('authorization') || '';
  if (bearer.toLowerCase().startsWith('bearer ')) return bearer.slice(7).trim();
  const header = req.headers.get('x-togetthere-token');
  if (header) return header.trim();
  const url = new URL(req.url);
  return (url.searchParams.get('token') || '').trim();
}

// Inbound reservation email endpoint. All parse/match/create work lives in the
// shared ingestion pipeline so the native inbox connectors (Gmail / Outlook)
// produce exactly the same result from the same message.
export default async function(req: Request) {
  try {
    const token = secrets.get('RESERVATION_INBOX_TOKEN');
    const incomingToken = getToken(req);
    if (!token || !incomingToken || incomingToken !== token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { record, reused } = await ingestReservationMessage(base44, {
      messageId: (typeof body?.messageId === 'string' ? body.messageId : body?.internetMessageId || body?.id || '').trim(),
      subject: typeof body?.subject === 'string' ? body.subject : '',
      sender: body?.from || body?.sender || body?.fromAddress,
      recipient: body?.to || body?.recipient || body?.toAddress,
      receivedAt: typeof body?.receivedAt === 'string' ? body.receivedAt : body?.date || '',
      text: buildInboundText(body),
      targetHints: body,
    });

    if (reused) return Response.json({ import: record, reused: true });
    if (!record) return Response.json({ error: 'No reservation content to parse' }, { status: 400 });

    return Response.json({ ok: true, status: record.status, import: record });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}