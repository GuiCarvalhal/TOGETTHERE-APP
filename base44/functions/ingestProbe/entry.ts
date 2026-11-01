// Temporary probe (deleted after the run): exercises the real shared ingestion
// pipeline end to end — classify → policy → ReservationImport record — then
// removes the rows it created.
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { ingestReservationMessage } from '../../shared/reservationIngestion.ts';

const CASES = [
  {
    label: 'flight_high',
    subject: 'Your flight BA208 to Naples is confirmed',
    text: 'British Airways booking reference: K7X2QP\nFlight BA208 from London Heathrow (LHR) to Naples (NAP)\nDeparture: 12 March 2027 09:35\nArrival: 12 March 2027 13:20\nTerminal 5, gate B32. Total: GBP 248.40',
  },
  {
    label: 'hotel_medium_or_high',
    subject: 'Reservation confirmed at Hotel Santa Caterina',
    text: 'Hotel Santa Caterina, Amalfi\nCheck-in: 14 June 2027 at 3:00 PM\nCheck-out: 18 June 2027 at 11:00 AM\n4 nights\nConfirmation code: HSC-88421',
  },
  {
    label: 'promo_denied',
    subject: 'Black Friday: 40% off flights!',
    text: 'Huge deals on flights and hotels. Unsubscribe here. Promo code SAVE40.',
  },
  {
    label: 'noise_low',
    subject: 'Monthly community update',
    text: 'Here is what happened in our neighbourhood this month. Thanks for reading.',
  },
];

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  const stamp = Date.now();
  const created: string[] = [];
  const results: any[] = [];

  try {
    for (const testCase of CASES) {
      const messageId = `probe-${stamp}-${testCase.label}`;
      const { record, reused } = await ingestReservationMessage(base44, {
        messageId,
        subject: testCase.subject,
        sender: 'probe@example.com',
        recipient: 'probe@example.com',
        receivedAt: new Date().toISOString(),
        text: testCase.text,
        targetHints: { targetUserEmail: 'probe@example.com' },
      });
      if (record?.id) created.push(record.id);
      results.push({
        label: testCase.label,
        reused,
        status: record?.status,
        type: record?.classification_type,
        confidence: record?.classification_confidence,
        signals: record?.classification_signals,
        source: record?.classification_source,
        ignoredReason: record?.ignored_reason,
        draft: {
          title: record?.extracted_draft?.title,
          start: record?.extracted_draft?.start_datetime,
          end: record?.extracted_draft?.end_datetime,
          reference: record?.extracted_draft?.booking_reference,
        },
        gatheringMatch: record?.auto_match_score,
      });
    }

    // Idempotency: re-ingesting the same source message must reuse the row.
    const repeat = await ingestReservationMessage(base44, {
      messageId: `probe-${stamp}-flight_high`,
      subject: 'Your flight BA208 to Naples is confirmed',
      text: 'Flight BA208 LHR to NAP, departure 12 March 2027 09:35',
      targetHints: { targetUserEmail: 'probe@example.com' },
    });

    return Response.json({ results, reingestReused: repeat.reused });
  } finally {
    for (const id of created) {
      await base44.asServiceRole.entities.ReservationImport.delete(id).catch(() => {});
    }
  }
}