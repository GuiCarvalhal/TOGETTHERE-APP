// Shared Google Maps Directions (driving) call used by getRouteDetails and
// getJourneyLegRoutes. Single source of truth for the URL params, key handling
// and response shape so the two endpoints never drift. Returns the first leg's
// distance/duration as BOTH human text (for display) and raw meters/seconds
// (for reliable summing), plus the deep-link maps URL. `ok: false` carries a
// status/error so callers can mark a leg unknown rather than zeroing it.
export async function fetchDrivingRoute(key, origin, destination) {
  const ts = Math.floor(Date.now() / 1000);
  const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=driving&departure_time=${ts}&traffic_model=best_guess&key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (data.status !== 'OK' || !data.routes?.length) {
    return { ok: false, status: data.status || 'no_route', error: data.error_message || data.status || 'No route found' };
  }
  const leg = data.routes[0].legs[0];
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  return {
    ok: true,
    distance: leg.distance?.text || '',
    distanceMeters: typeof leg.distance?.value === 'number' ? leg.distance.value : null,
    duration: leg.duration?.text || '',
    durationSeconds: typeof leg.duration?.value === 'number' ? leg.duration.value : null,
    durationInTraffic: leg.duration_in_traffic?.text || '',
    startAddress: leg.start_address || '',
    endAddress: leg.end_address || '',
    mapsUrl,
  };
}