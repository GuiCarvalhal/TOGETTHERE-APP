// Temporary probe (deleted after the run): runs the deterministic classifier
// over realistic EN/PT reservation emails and the dedupe helpers.
import {
  classifyReservation,
  decideReservationPolicy,
  RESERVATION_CONFIDENCE_POLICY,
} from '../../shared/reservationClassifier.ts';
import { bookingFingerprints, findDuplicateItem } from '../../shared/reservationImport.ts';

const CASES = [
  {
    name: 'flight_en',
    subject: 'Your flight BA208 to Naples is confirmed',
    text: [
      'British Airways booking reference: K7X2QP',
      'Flight BA208 from London Heathrow (LHR) to Naples (NAP)',
      'Departure: 12 March 2027 09:35',
      'Arrival: 12 March 2027 13:20',
      'Terminal 5, gate B32. Boarding pass attached.',
      'Ticket total: GBP 248.40',
    ].join('\n'),
    expectType: 'flight',
    expectOutcome: 'auto_create',
  },
  {
    name: 'flight_pt',
    subject: 'Sua reserva de voo confirmada',
    text: [
      'Companhia: LATAM',
      'Localizador: QWERT1',
      'Voo LA3456',
      'Partida: 02/11/2026 às 14h30 - Aeroporto de Guarulhos (GRU)',
      'Chegada: 02/11/2026 às 18h05 - Aeroporto de Lisboa (LIS)',
      'Valor total: R$ 3.480,90',
    ].join('\n'),
    expectType: 'flight',
    expectOutcome: 'auto_create',
  },
  {
    name: 'hotel_en',
    subject: 'Reservation confirmed at Hotel Santa Caterina',
    text: [
      'Hotel Santa Caterina, Amalfi',
      'Check-in: 14 June 2027 at 3:00 PM',
      'Check-out: 18 June 2027 at 11:00 AM',
      '4 nights — sea view suite',
      'Confirmation code: HSC-88421',
      'Total: EUR 1,240.00',
    ].join('\n'),
    expectType: 'hotel',
    expectOutcome: 'auto_create',
  },
  {
    name: 'hotel_pt',
    subject: 'Reserva confirmada - Pousada do Sol',
    text: [
      'Pousada do Sol, Paraty',
      'Check-in: 12 de março de 2027 às 15h00',
      'Check-out: 15 de março de 2027 às 12h00',
      '3 noites, quarto duplo',
      'Código de reserva: PDS2027',
    ].join('\n'),
    expectType: 'hotel',
    expectOutcome: 'auto_create',
  },
  {
    name: 'train_pt',
    subject: 'Bilhete comboio Lisboa → Porto confirmado',
    text: [
      'CP Comboios de Portugal',
      'Estação de partida: Lisboa - Santa Apolónia',
      'Partida: 20/07/2027 08h15',
      'Chegada: 20/07/2027 11h05',
      'Carruagem 4, lugar 62',
      'Código de reserva: CP778899',
    ].join('\n'),
    expectType: 'train',
    expectOutcome: 'auto_create',
  },
  {
    name: 'car_en',
    subject: 'Hertz rental confirmation',
    text: [
      'Hertz car rental agreement',
      'Pick-up: 3 September 2027 10:00 at Faro Airport',
      'Drop-off: 9 September 2027 10:00 at Faro Airport',
      'Vehicle class: compact, unlimited mileage',
      'Booking reference: HTZ44120',
    ].join('\n'),
    expectType: 'car',
    expectOutcome: 'auto_create',
  },
  {
    name: 'activity_en',
    subject: 'Your Eventbrite tickets for the Uffizi Gallery tour',
    text: [
      'Event: Uffizi Gallery guided tour',
      'Date: 22 May 2027 at 10:30 AM',
      'Venue: Uffizi Gallery, Florence',
      '2 adults',
      'Order code: EB-9921477',
    ].join('\n'),
    expectType: 'activity',
    expectOutcome: 'auto_create',
  },
  {
    name: 'promo_denied',
    subject: 'Black Friday: 40% off flights!',
    text: 'Huge deals on flights and hotels. Unsubscribe here. Promo code SAVE40.',
    expectType: 'other',
    expectOutcome: 'ignore',
    expectDeny: 'denied_promotional',
  },
  {
    name: 'password_reset_denied',
    subject: 'Redefinição de senha',
    text: 'Recebemos um pedido para redefinir a senha da sua conta. Se não foi você, ignore este e-mail.',
    expectType: 'other',
    expectOutcome: 'ignore',
    expectDeny: 'denied_account_security',
  },
  {
    name: 'retail_denied',
    subject: 'Your order has shipped',
    text: 'Your order shipped today. Tracking number 1Z999AA10123456784. Delivery confirmation to follow.',
    expectType: 'other',
    expectOutcome: 'ignore',
    expectDeny: 'denied_non_travel_receipt',
  },
  {
    name: 'noise_ignored',
    subject: 'Monthly community update',
    text: 'Here is what happened in our neighbourhood this month. Thanks for reading.',
    expectType: 'other',
    expectOutcome: 'ignore',
  },
  {
    name: 'ambiguous_flight_hotel',
    subject: 'Trip confirmation',
    text: [
      'Your flight and hotel are both confirmed.',
      'Flight 09:00, arrival 12:00.',
      'Check-in 14:00, check-out 11:00.',
    ].join('\n'),
    expectOutcome: 'pending',
  },
];

const DEDUPE = (() => {
  const updatedThread = {
    type: 'hotel',
    title: 'Hotel Santa Caterina (updated)',
    location_name: 'Hotel Santa Caterina',
    booking_reference: 'K7X2QP',
    start_datetime: '2027-06-14T15:00',
    end_datetime: '2027-06-18T11:00',
    confirmation_number: '',
  };
  const created = {
    id: 'item-1',
    type: 'hotel',
    title: 'Hotel Santa Caterina',
    location_name: 'Hotel Santa Caterina',
    booking_reference: 'K7X2QP',
    start_datetime: '2027-06-14T15:00',
    end_datetime: '2027-06-18T11:00',
    confirmation_number: 'HSC-88421',
  };
  const legacyNoRef = {
    id: 'item-2',
    type: 'hotel',
    title: 'Pousada do Sol',
    location_name: 'Pousada do Sol',
    booking_reference: '',
    start_datetime: '2027-03-12T15:00',
    end_datetime: '2027-03-15T12:00',
    confirmation_number: '',
  };
  const sameSlotNoCode = {
    type: 'hotel',
    title: 'Your stay in Paraty',
    location_name: 'Pousada do Sol',
    booking_reference: '',
    start_datetime: '2027-03-12T15:00',
    end_datetime: '2027-03-15T12:00',
    confirmation_number: '',
  };
  return {
    keysForUpdatedThread: bookingFingerprints(updatedThread),
    byReference: findDuplicateItem([created], updatedThread)?.reason || 'none',
    bySlot: findDuplicateItem([legacyNoRef], sameSlotNoCode)?.reason || 'none',
    unrelated: findDuplicateItem([created, legacyNoRef], {
      type: 'hotel',
      title: 'Hotel Splendido',
      location_name: 'Hotel Splendido',
      booking_reference: 'ZZZ999',
      start_datetime: '2027-08-01T15:00',
      end_datetime: '2027-08-04T11:00',
      confirmation_number: 'ABC123',
    }) ? 'duplicate' : 'none',
  };
})();

export default async function (): Promise<Response> {
  const results = CASES.map((testCase) => {
    const classification = classifyReservation({ subject: testCase.subject, text: testCase.text });
    const policy = decideReservationPolicy(classification);
    const typeOk = !testCase.expectType || classification.type === testCase.expectType;
    const outcomeOk = policy.outcome === testCase.expectOutcome;
    const denyOk = !testCase.expectDeny || classification.denyCode === testCase.expectDeny;
    return {
      name: testCase.name,
      ok: typeOk && outcomeOk && denyOk,
      type: classification.type,
      expectedType: testCase.expectType || '(any)',
      confidence: Number(classification.confidence.toFixed(2)),
      score: classification.score,
      outcome: policy.outcome,
      expectedOutcome: testCase.expectOutcome,
      reasonCode: policy.reasonCode,
      denyCode: classification.denyCode,
      signals: classification.signals,
      draft: {
        title: classification.draft.title,
        start: classification.draft.start_datetime,
        end: classification.draft.end_datetime,
        from: classification.draft.location_from,
        to: classification.draft.location_to,
        place: classification.draft.location_name,
        confirmation: classification.draft.confirmation_number,
        reference: classification.draft.booking_reference,
        airline: classification.draft.airline,
      },
      fields: classification.fields,
    };
  });

  return Response.json({
    policy: RESERVATION_CONFIDENCE_POLICY,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    failures: results.filter((r) => !r.ok).map((r) => r.name),
    results: results.filter((r) => ['ambiguous_flight_hotel'].includes(r.name)),
    dedupe: DEDUPE,
  });
}