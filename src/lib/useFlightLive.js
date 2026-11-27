import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { trackingPhase } from '@/lib/flightTracking';

// Live flight status for ONE segment, but only while the flight is inside the
// tracking window (T-6h → +2h after landing). Outside it nothing is requested
// and the card keeps its regular, stored view — a journey list with twenty
// future flights costs nothing.
//
// Reads through getFlightStatus, which serves from the shared FlightStatusCache,
// so a Home brief and a journey card asking for the same flight cost one
// provider call between them.
const REFRESH_MS = 5 * 60 * 1000;

export function useFlightLive(item) {
  const isFlight = item?.type === 'flight';
  const startMs = item?.start_datetime ? Date.parse(item.start_datetime) : NaN;
  const endMs = item?.end_datetime ? Date.parse(item.end_datetime) : NaN;
  const phase = isFlight ? trackingPhase({ startMs, endMs }) : 'after';
  const flightNumber = item?.confirmation_number || '';
  const active = phase === 'active' && !!flightNumber;

  const [state, setState] = useState({ data: null, at: 0 });

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const load = () => base44.functions.invoke('getFlightStatus', {
      flight_number: flightNumber,
      date: item.start_datetime ? item.start_datetime.slice(0, 10) : '',
      departure_at: item.start_datetime || '',
      origin_timezone: item.from_place?.tz || '',
    }).then((res) => {
      if (alive) setState({ data: res.data || res, at: Date.now() });
    }).catch(() => {});

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, flightNumber, item?.start_datetime, item?.from_place?.tz]);

  // Leaving the window drops the live line instead of freezing a stale one.
  useEffect(() => {
    if (!active) setState({ data: null, at: 0 });
  }, [active]);

  return { phase, active, data: state.data, updatedAt: state.at };
}

export default useFlightLive;