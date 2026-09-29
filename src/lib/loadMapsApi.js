// Loads the Google Maps JS API exactly once per page load (module-level
// promise singleton). Shared by every map surface in the app — SegmentMap and
// the journey route map — so the <script> tag and the google.maps namespace
// are initialized a single time, using the SAME key the backend already
// exposes via getMapsConfig (GOOGLEMAPS_TOGETTHERE). No second integration,
// no second key, no npm dependency. Resolves with the google.maps namespace
// or rejects so callers can fall back gracefully.
let mapsPromise = null;
export function loadMapsApi(key) {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(window.google.maps); return; }
    const cb = `__ttMapsCb_${Math.random().toString(36).slice(2)}`;
    window[cb] = () => { delete window[cb]; resolve(window.google.maps); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=${cb}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => { delete window[cb]; mapsPromise = null; reject(new Error('maps-load-failed')); };
    document.head.appendChild(s);
  });
  return mapsPromise;
}