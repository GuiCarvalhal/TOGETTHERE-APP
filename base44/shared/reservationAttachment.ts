// Attaches the ORIGINAL email to an imported reservation.
//
// One booking email can describe several segments (two flights of a round trip,
// a flight plus a hotel). The archive is built once per message and the same
// file uri is carried by every segment created from it, so each item in the
// journey keeps a complete copy of the email it came from.
//
// The file is stored PRIVATE (UploadPrivateFile): it holds names, addresses and
// payment details, so it is never world-readable. Viewers open it through a
// short-lived signed URL (see AttachmentChip).

const MAX_ARCHIVE_CHARS = 200000;

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export type SourceEmailMeta = {
  subject?: string;
  sender?: string;
  recipient?: string;
  receivedAt?: string;
  text?: string;
  messageId?: string;
};

function headerDate(value: string) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? new Date(ms).toUTCString() : new Date().toUTCString();
}

function slug(value: string) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// A readable .eml-style archive: headers first, then the message text exactly as
// it was received. Built from the message the connector/inbound endpoint already
// fetched — nothing is re-requested from the provider.
export function buildEmailArchive(meta: SourceEmailMeta) {
  const body = text(meta?.text).slice(0, MAX_ARCHIVE_CHARS);
  const headers = [
    `Subject: ${text(meta?.subject) || '(no subject)'}`,
    `From: ${text(meta?.sender) || 'unknown'}`,
    `To: ${text(meta?.recipient) || 'unknown'}`,
    `Date: ${headerDate(text(meta?.receivedAt))}`,
  ];
  if (text(meta?.messageId)) headers.push(`Message-Id: ${text(meta?.messageId)}`);
  headers.push('Content-Type: text/plain; charset="utf-8"');
  return `${headers.join('\n')}\n\n${body}\n`;
}

export function emailFileName(meta: SourceEmailMeta) {
  const date = new Date(headerDate(text(meta?.receivedAt)));
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
  const name = slug(text(meta?.subject)) || 'reservation';
  return `reservation-${stamp}-${name}.eml`;
}

// Uploads the archive and returns its private file uri. Best-effort: a failed
// upload must never block the import (the plain text is still kept on the inbox
// row and the import record).
export async function uploadSourceEmail(base44: any, meta: SourceEmailMeta): Promise<string> {
  if (!text(meta?.text)) return '';
  try {
    const archive = buildEmailArchive(meta);
    const fileName = emailFileName(meta);
    const file = new File([archive], fileName, { type: 'message/rfc822' });
    const uploaded = await base44.asServiceRole.integrations.Core.UploadPrivateFile({ file });
    return text(uploaded?.file_uri);
  } catch {
    return '';
  }
}