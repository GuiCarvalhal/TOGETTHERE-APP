import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

// Lists the current user's journey inbox: imported segments that are not part of
// a gathering yet. Rows already hold the standard item payload (resolved places,
// UTC instants, attachments with the source email), so the client renders them
// with the same card as any journey item.
//
// The query is a plain filter (no sort/limit options) and the newest rows are
// selected in memory, keeping this working on a freshly created entity.
const MAX_ROWS = 200;

export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rows = await base44.asServiceRole.entities.JourneyInboxItem.filter({
      owner_user_id: user.id,
      status: 'new',
    });

    const items = (Array.isArray(rows) ? rows : (rows?.items || []))
      .sort((a: any, b: any) => String(a.start_datetime || '').localeCompare(String(b.start_datetime || '')))
      .slice(0, MAX_ROWS)
      .map((row: any) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        start_datetime: row.start_datetime || null,
        end_datetime: row.end_datetime || null,
        location_from: row.location_from || '',
        location_to: row.location_to || '',
        location_name: row.location_name || '',
        confirmation_number: row.confirmation_number || '',
        booking_reference: row.booking_reference || '',
        airline: row.airline || '',
        notes: row.notes || '',
        attachments: row.attachments || [],
        place_photo: row.place_photo || '',
        place: row.place || null,
        from_place: row.from_place || null,
        to_place: row.to_place || null,
        missing: row.missing || [],
        source_subject: row.source_subject || '',
        source_sender: row.source_sender || '',
        source_received_at: row.source_received_at || null,
        source_content: row.source_content || '',
      }));

    return Response.json({ items });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}