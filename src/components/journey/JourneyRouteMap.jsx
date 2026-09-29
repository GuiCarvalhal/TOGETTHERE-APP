import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loadMapsApi } from '@/lib/loadMapsApi';
import { itemStartTz } from '@/lib/useItemPlace';
import { formatFullDateTz, formatTimeTz } from '@/lib/formatPlaceTime';
import { itemWaypoints, itemRouteNumbers, placeLabel } from '@/lib/journeyMap';
import { MapPin, Loader2 } from 'lucide-react';

const TERRA = '#E05A47';
// Suggested-place markers use a distinct indigo teardrop pin so confirmed
// (terra numbered circles) vs suggestion is unmistakable.
const SUGGESTED_COLOR = '#4F46E5';
const PIN_PATH = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Whole-journey route map with an optional "suggested" layer.
//  - ONE route for everything visible on the page: numbered terra-circle pins
//    in chronological order, connected by a single terra polyline. No
//    per-person splitting — the mine/group switch just changes which items are
//    on the page; the map maps whatever it's given.
//  - Pin numbers come from the shared `itemRouteNumbers` source (same source
//    the journey cards use for their left-column marker), so a card and its pin
//    can never show different numbers.
//  - `suggestions` (optional, Agent page): { lat, lng, name, categoryLabel,
//    rating, to, place } — rendered as distinct indigo teardrop pins ON TOP,
//    never part of the polyline. A compact in-map legend distinguishes
//    "Your itinerary" (terra) from "Suggested" (indigo). The Journey page passes
//    no suggestions, so no legend renders there.
// Reuses the shared maps loader + getMapsConfig — no second integration.
// Fails gracefully (never crashes the page).
export default function JourneyRouteMap({ items, gatheringId, suggestions }) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'fallback'
  const [legend, setLegend] = useState([]);
  const [showLegend, setShowLegend] = useState(false);

  // Single numbering source — shared with the journey cards. Each mappable
  // item's first waypoint takes the next number; its remaining waypoints
  // (e.g. a flight's destination) carry number+1, number+2… so the map's pin
  // labels are derived from the same Map the cards read.
  const itemNumbers = itemRouteNumbers(items);
  const sorted = [...items].sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0));
  const waypoints = [];
  sorted.forEach((it) => {
    const wps = itemWaypoints(it);
    if (wps.length === 0) return;
    const base = itemNumbers.get(it.id);
    wps.forEach((w, i) => waypoints.push({ ...w, item: it, number: base + i }));
  });

  const suggList = suggestions || [];
  // Stable fingerprints so the map re-renders only when the pinned set or
  // suggestions actually change (not on every polling refresh).
  const mapKey = items.map((i) => {
    const o = i.from_place, d = i.to_place, p = i.place;
    const c = [o?.lat, o?.lng, d?.lat, d?.lng, p?.lat, p?.lng]
      .map((n) => (n == null ? '' : Number(n).toFixed(3))).join(',');
    return `${i.id}:${c}`;
  }).join('|');
  const suggKey = suggList.map((s) => `${s.name}::${s.lat},${s.lng}`).join('|');

  useEffect(() => {
    if (waypoints.length === 0 && suggList.length === 0) return;
    let cancelled = false;
    const overlays = [];
    let infoWindow = null;
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
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
          center: { lat: 20, lng: 0 },
          zoom: 2,
        });
        const bounds = new maps.LatLngBounds();
        const pinIcon = () => ({
          path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: TERRA, fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 2,
        });
        const suggestedIcon = () => ({
          path: PIN_PATH, scale: 1.6, fillColor: SUGGESTED_COLOR, fillOpacity: 1,
          strokeColor: '#fff', strokeWeight: 1.5, anchor: new maps.Point(12, 22),
        });

        // Numbered confirmed pins — one per waypoint. Click → item detail.
        waypoints.forEach((w) => {
          const pos = { lat: w.lat, lng: w.lng };
          const marker = new maps.Marker({
            position: pos, map,
            label: { text: String(w.number), color: '#fff', fontSize: '11px', fontWeight: '700' },
            icon: pinIcon(),
          });
          bounds.extend(pos);
          marker.addListener('click', () => {
            const it = w.item;
            const tz = itemStartTz(it);
            const dateStr = formatFullDateTz(it.start_datetime, tz) || 'No date set';
            const timeStr = formatTimeTz(it.start_datetime, tz);
            const node = document.createElement('div');
            node.style.maxWidth = '220px';
            node.innerHTML = `
              <div style="font-weight:700;font-size:14px;line-height:1.2;margin-bottom:3px">${escapeHtml(it.title || 'Segment')}</div>
              <div style="font-size:12px;color:#555">${escapeHtml(dateStr)}${timeStr ? ' · ' + escapeHtml(timeStr) : ''}</div>
              <div style="font-size:12px;color:#555;margin-top:2px">${escapeHtml(w.name || placeLabel(it))}</div>
              <a href="#" style="display:inline-block;margin-top:7px;font-size:12px;font-weight:600;color:#E05A47;text-decoration:none">View details →</a>`;
            node.querySelector('a').addEventListener('click', (ev) => {
              ev.preventDefault();
              navigate(`/gathering/${gatheringId}/journey/${it.id}`);
            });
            if (!infoWindow) infoWindow = new maps.InfoWindow();
            infoWindow.setContent(node);
            infoWindow.open(map, marker);
          });
          overlays.push(marker);
        });

        // Single route polyline through every confirmed waypoint, in order.
        const path = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
        if (path.length >= 2) {
          overlays.push(new maps.Polyline({
            path, map, geodesic: true, strokeColor: TERRA, strokeOpacity: 0.85, strokeWeight: 3,
          }));
        }

        // Suggested places — distinct indigo pins, never part of the route.
        suggList.forEach((s) => {
          if (s.lat == null || s.lng == null) return;
          const pos = { lat: s.lat, lng: s.lng };
          const marker = new maps.Marker({ position: pos, map, icon: suggestedIcon() });
          bounds.extend(pos);
          marker.addListener('click', () => {
            const node = document.createElement('div');
            node.style.maxWidth = '220px';
            const cat = s.categoryLabel
              ? `<div style="display:inline-block;padding:1px 7px;border-radius:999px;background:#4F46E5;color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${escapeHtml(s.categoryLabel)}</div>`
              : '';
            const rating = s.rating != null
              ? `<div style="font-size:12px;color:#555;margin-top:2px">★ ${s.rating.toFixed(1)}</div>`
              : '';
            node.innerHTML = `${cat}
              <div style="font-weight:700;font-size:14px;line-height:1.2">${escapeHtml(s.name || 'Suggested place')}</div>
              ${rating}
              <a href="#" style="display:inline-block;margin-top:7px;font-size:12px;font-weight:600;color:#4F46E5;text-decoration:none">View details →</a>`;
            node.querySelector('a').addEventListener('click', (ev) => {
              ev.preventDefault();
              navigate(s.to, { state: { place: s.place, categoryLabel: s.categoryLabel } });
            });
            if (!infoWindow) infoWindow = new maps.InfoWindow();
            infoWindow.setContent(node);
            infoWindow.open(map, marker);
          });
          overlays.push(marker);
        });

        // Compact in-map legend — ONLY when suggestions are present (Agent
        // page), to keep "Your itinerary" vs "Suggested" clear. No legend on the
        // Journey page (no suggestions → nothing to distinguish).
        if (suggList.length > 0) {
          const layerLegend = [];
          if (waypoints.length > 0) layerLegend.push({ color: TERRA, name: 'Your itinerary' });
          layerLegend.push({ color: SUGGESTED_COLOR, name: 'Suggested' });
          setLegend(layerLegend);
          setShowLegend(layerLegend.length > 0);
        } else {
          setLegend([]);
          setShowLegend(false);
        }

        if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) setStatus('fallback');
      }
    })();
    return () => {
      cancelled = true;
      overlays.forEach((o) => { try { o.setMap(null); } catch { /* ignore */ } });
      if (infoWindow) { try { infoWindow.close(); } catch { /* ignore */ } }
      setLegend([]);
      setShowLegend(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, suggKey, gatheringId, navigate]);

  return (
    <div className="relative w-full h-48 sm:h-56 lg:h-64 rounded-xl overflow-hidden border border-ink-charcoal/15 bg-cream-pale">
      <div ref={mapRef} className="absolute inset-0" />
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream-pale">
          <Loader2 className="w-5 h-5 text-terra animate-spin" />
        </div>
      )}
      {status === 'fallback' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-cream-pale">
          <MapPin className="w-8 h-8 text-terra/50 mb-2" />
          <p className="text-sm text-ink-deep/70">The route map couldn't load right now.</p>
          <p className="text-xs text-ink-deep/50 mt-1">Try again in a moment.</p>
        </div>
      )}
      {status === 'ready' && showLegend && (
        <div className="absolute top-2 left-2 z-10 tt-glass rounded-xl p-2 max-w-[55%] tt-no-scrollbar overflow-auto max-h-[90%]">
          {legend.map((l) => (
            <div key={l.color + l.name} className="flex items-center gap-1.5 text-[11px] py-0.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
              <span className="text-ink-deep truncate">{l.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}