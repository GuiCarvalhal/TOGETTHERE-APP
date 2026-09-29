import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { loadMapsApi } from '@/lib/loadMapsApi';
import { itemStartTz } from '@/lib/useItemPlace';
import { formatFullDateTz, formatTimeTz } from '@/lib/formatPlaceTime';
import { itemWaypoints, itemParticipantIds, placeLabel } from '@/lib/journeyMap';
import { MapPin, Loader2 } from 'lucide-react';

const TERRA = '#E05A47';
// Distinct, readable per-person route colours (group scope). Cycles if there
// are more people than colours.
const ROUTE_COLORS = ['#E05A47', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#14B8A6', '#6366F1'];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Whole-journey route map. Renders one numbered pin per coordinate (waypoint)
// in chronological order, fits bounds to all pins, and draws:
//  - mine scope: a single polyline through every visible waypoint
//  - group scope: one polyline per person (distinct colour) + a legend
// Clicking a pin opens an info card (title, date/time, place) with a link to
// the item's detail page. Reuses the shared maps loader + getMapsConfig — no
// second integration. Fails gracefully (never crashes the page).
export default function JourneyRouteMap({ items, memberById, scope, gatheringId }) {
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'fallback'
  const [legend, setLegend] = useState([]);

  // Chronological order + flatten to numbered waypoints (one pin per stop).
  const sorted = [...items].sort((a, b) => new Date(a.start_datetime || 0) - new Date(b.start_datetime || 0));
  const mappable = sorted.filter((it) => itemWaypoints(it).length > 0);
  const waypoints = [];
  mappable.forEach((it) => itemWaypoints(it).forEach((w) => waypoints.push({ ...w, item: it })));
  waypoints.forEach((w, i) => { w.number = i + 1; });

  // Stable fingerprints so the map re-renders only when the pinned set, scope,
  // or member names actually change (not on every polling refresh).
  const mapKey = items.map((i) => {
    const o = i.from_place, d = i.to_place, p = i.place;
    const c = [o?.lat, o?.lng, d?.lat, d?.lng, p?.lat, p?.lng]
      .map((n) => (n == null ? '' : Number(n).toFixed(3))).join(',');
    return `${i.id}:${c}`;
  }).join('|');
  const membersKey = Object.keys(memberById || {}).join('|');

  useEffect(() => {
    if (mappable.length === 0) return;
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

        // Numbered pins — one per waypoint. Clicking opens an info card with a
        // link to the item's detail page.
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

        // Polylines — draw the journey route.
        if (scope === 'mine') {
          const path = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
          if (path.length >= 2) {
            overlays.push(new maps.Polyline({
              path, map, geodesic: true, strokeColor: TERRA, strokeOpacity: 0.85, strokeWeight: 3,
            }));
          }
        } else {
          // group: one polyline per person, distinct colour, legend.
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
          const legendItems = order.map((mid) => ({
            color: memberColor[mid],
            name: memberById?.[mid]?.full_name || memberById?.[mid]?.email || 'Member',
          }));
          setLegend(legendItems);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey, scope, gatheringId, membersKey, navigate]);

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
      {status === 'ready' && legend.length > 1 && (
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