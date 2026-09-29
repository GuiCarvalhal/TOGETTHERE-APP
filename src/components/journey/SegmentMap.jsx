import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Navigation } from 'lucide-react';
import { loadMapsApi } from '@/lib/loadMapsApi';

// The Google Maps JS API loader lives in src/lib/loadMapsApi.js and is shared
// with the journey route map so the <script> tag + google.maps namespace are
// initialized exactly once across the whole app — no second integration or
// key. Uses the SAME key the backend already uses (GOOGLEMAPS_TOGETTHERE),
// exposed via getMapsConfig.

const TERRA = '#E05A47';

// Interactive map for a journey segment.
//  - BOTH origin & destination coords (flights, rides, any from/to): two markers
//    + a connecting line (great-circle/curved for flights, straight otherwise),
//    viewport auto-fitted to both points with padding.
//  - ONE point (stays, activities): a single centered marker, no line.
//  - Coords missing / JS API can't load: degrades to the existing keyless embed
//    iframe (or nothing) — no broken map, no thrown errors.
// Tapping the map opens the location/route in Google Maps.
//
// origin/destination/point are { lat, lng } (from the item's stored
// from_place / to_place / place). `query` is the free-text fallback for the
// embed. Mount one instance per item (parent keys it by item id).
export default function SegmentMap({ origin, destination, point, query, isFlight }) {
  const mapRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'fallback'

  const hasTwo = !!(origin && destination && origin.lat != null && destination.lat != null);
  const hasOne = !hasTwo && !!(point && point.lat != null);

  const openMapsUrl = hasTwo
    ? `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}`
    : hasOne
      ? `https://www.google.com/maps/search/?api=1&query=${point.lat},${point.lng}`
      : query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';

  useEffect(() => {
    if (!hasTwo && !hasOne) { setStatus('fallback'); return; }
    let cancelled = false;
    const overlays = [];
    (async () => {
      try {
        const res = await base44.functions.invoke('getMapsConfig', {});
        const data = res.data || res;
        const key = data.mapsKey;
        if (!key) throw new Error('no-key');
        const maps = await loadMapsApi(key);
        if (cancelled || !mapRef.current) return;
        const map = new maps.Map(mapRef.current, {
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: false,
          clickableIcons: false,
          draggable: false,
          scrollwheel: false,
          disableDoubleClickZoom: true,
          gestureHandling: 'none',
          keyboardShortcuts: false,
          center: { lat: 20, lng: 0 },
          zoom: 2,
        });
        const pin = () => ({
          path: maps.SymbolPath.CIRCLE, scale: 11, fillColor: TERRA, fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 2,
        });
        if (hasTwo) {
          const o = { lat: origin.lat, lng: origin.lng };
          const d = { lat: destination.lat, lng: destination.lng };
          overlays.push(new maps.Marker({ position: o, map, label: { text: 'A', color: '#fff', fontSize: '11px', fontWeight: '700' }, icon: pin() }));
          overlays.push(new maps.Marker({ position: d, map, label: { text: 'B', color: '#fff', fontSize: '11px', fontWeight: '700' }, icon: pin() }));
          overlays.push(new maps.Polyline({ path: [o, d], map, geodesic: !!isFlight, strokeColor: TERRA, strokeOpacity: 0.9, strokeWeight: 3 }));
          const bounds = new maps.LatLngBounds(); bounds.extend(o); bounds.extend(d);
          map.fitBounds(bounds, 64);
        } else {
          const p = { lat: point.lat, lng: point.lng };
          overlays.push(new maps.Marker({ position: p, map, icon: pin() }));
          map.setCenter(p); map.setZoom(13);
        }
        if (!cancelled) setStatus('ready');
      } catch (e) {
        if (!cancelled) setStatus('fallback');
      }
    })();
    return () => {
      cancelled = true;
      overlays.forEach((o) => { try { o.setMap(null); } catch { /* ignore */ } });
    };
  }, [hasTwo, hasOne, isFlight, origin?.lat, origin?.lng, destination?.lat, destination?.lng, point?.lat, point?.lng]);

  if (!hasTwo && !hasOne && !query) return null;

  // Fallback: keyless Google Maps embed iframe (the previous behavior), with a
  // tap overlay + subtle hint — no full button.
  if (status === 'fallback') {
    const embedSrc = query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : '';
    if (!embedSrc) return null;
    return (
      <div className="relative w-full h-48 rounded-xl overflow-hidden border border-ink-charcoal/15 bg-cream-pale">
        <iframe title={`Map of ${query}`} src={embedSrc} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="absolute inset-0 w-full h-full" />
        {openMapsUrl && (
          <div role="link" aria-label="Open in Google Maps" onClick={() => window.open(openMapsUrl, '_blank', 'noopener,noreferrer')} className="absolute inset-0 z-10 cursor-pointer" />
        )}
        {openMapsUrl && (
          <span className="absolute top-2 right-2 z-20 pointer-events-none inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/45 backdrop-blur-sm text-white text-[11px] font-semibold">
            <Navigation className="w-3 h-3" /> Tap to open
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full h-48 rounded-xl overflow-hidden border border-ink-charcoal/15 bg-cream-pale">
      <div ref={mapRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream-pale">
          <div className="w-5 h-5 border-2 border-terra/30 border-t-terra rounded-full animate-spin" />
        </div>
      )}
      {status === 'ready' && openMapsUrl && (
        <>
          <div role="link" aria-label="Open in Google Maps" onClick={() => window.open(openMapsUrl, '_blank', 'noopener,noreferrer')} className="absolute inset-0 z-10 cursor-pointer" />
          <span className="absolute top-2 right-2 z-20 pointer-events-none inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-black/45 backdrop-blur-sm text-white text-[11px] font-semibold">
            <Navigation className="w-3 h-3" /> Tap to open
          </span>
        </>
      )}
    </div>
  );
}