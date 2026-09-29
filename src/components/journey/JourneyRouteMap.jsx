import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loadMapsApi } from '@/lib/loadMapsApi';
import { itemStartTz } from '@/lib/useItemPlace';
import { formatFullDateTz, formatTimeTz } from '@/lib/formatPlaceTime';
import { itemWaypoints, itemParticipantIds, placeLabel } from '@/lib/journeyMap';
import { MapPin, Loader2 } from 'lucide-react';

const TERRA = '#E05A47';
// Suggested-place markers use a distinct indigo teardrop pin so confirmed
// (terra numbered circles) vs suggestion is unmistakable.
const SUGGESTED_COLOR = '#4F46E5';
const PIN_PATH = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z';
// Distinct, readable per-person route colours (group scope). Cycles if there
// are more people than colours.
const ROUTE_COLORS = ['#E05A47', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Whole-journey route map with an optional "suggested" layer.
//  - Confirmed journey waypoints: numbered terra-circle pins in chronological
//    order, connected by the route polyline (mine: one line; group: one per
//    person). Unchanged when `suggestions` is absent (Journey page).
//  - `suggestions` (optional): { lat, lng, name, categoryLabel, rating, to,
//    place } — rendered as distinct indigo teardrop pins ON TOP, never part of
//    the polyline. Clicking opens a compact info card (name, category, rating)
//    with a link to the suggestion's detail page (router state carries the
//    place + category, matching the AgentPlaceCard navigation).
// Reuses the shared maps loader + getMapsConfig — no second integration.
// Fails gracefully (never crashes the page).
export default function JourneyRouteMap({ items, memberById, scope, gatheringId, suggestions }) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'fallback'
  const [legend, setLegend] = useState([]);
  const [showLegend, setShowLegend] = useState(false);

  // Chronological order + flatten to numbered waypoints (one pin per stop).
  const sorted = [...items].sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0));
  const mappable = sorted.filter((it) => itemWaypoints(it).length > 0);
  const waypoints = [];
  mappable.forEach((it) => itemWaypoints(it).forEach((w) => waypoints.push({ ...w, item: it })));
  waypoints.forEach((w, i) => { w.number = i + 1; });

  const suggList = suggestions || [];
  // Stable fingerprints so the map re-renders only when the pinned set, scope,
  // members, or suggestions actually change (not on every polling refresh).
  const mapKey = items.map((i) => {
    const o = i.from_place, d = i.to_place, p = i.place;
    const c = [o?.lat, o?.lng, d?.lat, d?.lng, p?.lat, p?.lng]
      .map((n) => (n == null ? '' : Number(n).toFixed(3))).join(',');
    return `${i.id}:${c}`;
  }).join('|');
  const suggKey = suggList.map((s) => `${s.name}::${s.lat},${s.lng}`).join('|');
  const membersKey = Object.keys(memberById || {}).join('|');

  useEffect(() => {
    if (mappable.length === 0 && suggList.length === 0) return;
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
        const pinIcon = (color) => ({
          path: maps.SymbolPath.CIRCLE, scale: 13, fillColor: color, fillOpacity: 1,
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
            icon: pinIcon(TERRA),
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

        // Polylines — draw the confirmed journey route.
        let personLegend = [];
        if (scope === 'mine') {
          const path = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
          if (path.length >= 2) {
            overlays.push(new maps.Polyline({
              path, map, geodesic: true, strokeColor: TERRA, strokeOpacity: 0.85, strokeWeight: 3,
            }));
          }
        } else {
          const memberColor = {};
          const order = [];
          mappable.forEach((it) => {
            itemParticipantIds(it).forEach((mid) => {
              if (!memberColor[mid]) {
                memberColor[mid] = ROUTE_COLORS[order.length % ROUTE_COLORS.length];
                order.push(mid);
              }
            });
          });
          personLegend = order.map((mid) => ({
            color: memberColor[mid],
            name: memberById?.[mid]?.full_name || memberById?.[mid]?.email || 'Member',
          }));
          order.forEach((mid) => {
            const path = [];
            mappable.forEach((it) => {
              if (itemParticipantIds(it).includes(mid)) {
                itemWaypoints(it).forEach((wp) => path.push({ lat: wp.lat, lng: wp.lng }));
              }
            });
            if (path.length >= 2) {
              overlays.push(new maps.Polyline({
                path, map, geodesic: true, strokeColor: memberColor[mid], strokeOpacity: 0.8, strokeWeight: 3,
              }));
            }
          });
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

        // Legend: layer legend when suggestions are present; else per-person
        // (group, >1 person) — preserving the Journey page's exact behaviour.
        if (suggList.length > 0) {
          const layerLegend = [];
          if (mappable.length > 0) layerLegend.push({ color: TERRA, name: 'Your itinerary' });
          layerLegend.push({ color: SUGGESTED_COLOR, name: 'Suggested' });
          setLegend(layerLegend);
          setShowLegend(layerLegend.length > 0);
        } else if (scope === 'group' && personLegend.length > 1) {
          setLegend(personLegend);
          setShowLegend(true);
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
  }, [mapKey, suggKey, scope, gatheringId, membersKey, navigate]);

  return (
    <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden border border-ink-charcoal/15 bg-cream-pale">
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