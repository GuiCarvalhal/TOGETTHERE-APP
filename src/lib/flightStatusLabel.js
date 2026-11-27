// The airline feed spells its statuses its own way ("Expected", "CheckIn",
// "GateClosed", "Canceled"). The app used to print that raw English word in the
// stamp and match its colour against our own spelling, so "Canceled" (one L)
// never turned red and a departed flight still read like a booking. Map the
// provider's word onto our own key, and let the copy stay translated.
const KEYS = {
  expected: 'scheduled',
  unknown: '',
  checkin: 'checkIn',
  boarding: 'boarding',
  gateclosed: 'gateClosed',
  departed: 'departed',
  delayed: 'delayed',
  approaching: 'approaching',
  arrived: 'arrived',
  diverted: 'diverted',
  canceled: 'cancelled',
  cancelled: 'cancelled',
};

export function flightStatusKey(status) {
  const raw = String(status || '').replace(/[\s-]+/g, '').toLowerCase();
  return KEYS[raw] ?? '';
}

// The aircraft is already moving: the gate is no longer the news, the state is.
export const OPERATIONAL_STATUSES = ['boarding', 'gateClosed', 'departed', 'approaching', 'arrived', 'diverted'];

export const FLIGHT_STATUS_TONE = {
  scheduled: 'bg-ink-deep/8 text-ink-deep/70 border-ink-charcoal/15',
  checkIn: 'bg-terra/15 text-terra-deep border-terra/30',
  boarding: 'bg-terra/15 text-terra-deep border-terra/30',
  gateClosed: 'bg-terra/15 text-terra-deep border-terra/30',
  departed: 'bg-terra/15 text-terra-deep border-terra/30',
  approaching: 'bg-terra/15 text-terra-deep border-terra/30',
  arrived: 'bg-[#4a8b6f]/15 text-[#3f7a5e] border-[#4a8b6f]/30',
  diverted: 'bg-amber-100 text-amber-700 border-amber-300',
  delayed: 'bg-amber-100 text-amber-700 border-amber-300',
  cancelled: 'bg-destructive/12 text-destructive border-destructive/30',
};