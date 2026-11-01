import React from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// Signal codes the deterministic classifier emits, mapped to copy. Only codes
// listed here are ever rendered, so a new internal signal can never leak a raw
// token into the UI.
const SIGNAL_LABEL_KEYS = {
  pnr: 'home.signal_pnr',
  flight_number: 'home.signal_flight_number',
  flight_terms: 'home.signal_flight_terms',
  departure_arrival: 'home.signal_departure_arrival',
  airport_terms: 'home.signal_airport_terms',
  boarding_pass: 'home.signal_boarding_pass',
  checkin_checkout: 'home.signal_checkin_checkout',
  nights: 'home.signal_nights',
  hotel_terms: 'home.signal_hotel_terms',
  address_block: 'home.signal_address_block',
  guest_room: 'home.signal_guest_room',
  stay_window: 'home.signal_stay_window',
  rail_terms: 'home.signal_rail_terms',
  bus_terms: 'home.signal_bus_terms',
  station_terms: 'home.signal_station_terms',
  seat_carriage: 'home.signal_seat_carriage',
  rental_terms: 'home.signal_rental_terms',
  pickup_dropoff: 'home.signal_pickup_dropoff',
  vehicle_class: 'home.signal_vehicle_class',
  rental_vendor: 'home.signal_rental_vendor',
  mileage_terms: 'home.signal_mileage_terms',
  ticket_terms: 'home.signal_ticket_terms',
  event_datetime: 'home.signal_event_datetime',
  booking_code: 'home.signal_booking_code',
  ticket_vendor: 'home.signal_ticket_vendor',
  party_size: 'home.signal_party_size',
  venue_terms: 'home.signal_venue_terms',
};

const TYPE_LABEL_KEYS = {
  flight: 'journeyTypes.flight',
  hotel: 'journeyTypes.hotel',
  train: 'journeyTypes.train',
  car: 'journeyTypes.car',
  activity: 'journeyTypes.activity',
};

// One lightweight line explaining why an imported reservation was read as this
// type, e.g. "Detected stay: check-in/check-out, hotel wording".
export default function ImportClassificationNote({ item }) {
  const { t } = useI18n();
  const typeKey = TYPE_LABEL_KEYS[item?.classification_type];
  if (!typeKey) return null;

  const signals = (Array.isArray(item?.classification_signals) ? item.classification_signals : [])
    .map((code) => (SIGNAL_LABEL_KEYS[code] ? t(SIGNAL_LABEL_KEYS[code]) : ''))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <p className="text-[0.6875rem] text-ink-deep/55 mt-1 flex items-start gap-1.5">
      <Sparkles className="w-3 h-3 mt-0.5 shrink-0 text-terra-coral" />
      <span>
        {signals.length
          ? t('home.importDetected', { type: t(typeKey), signals: signals.join(', ') })
          : t('home.importDetectedNoSignals', { type: t(typeKey) })}
      </span>
    </p>
  );
}