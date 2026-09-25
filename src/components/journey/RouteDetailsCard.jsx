import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Navigation, Route as RouteIcon, Clock, AlertTriangle } from 'lucide-react';

// Driving distance + duration between origin and destination (Google Maps
// Directions). Shows a compact route summary with a live-traffic estimate
// when available, plus a deep link to turn-by-turn navigation. On failure it
// surfaces a clear "unavailable" state (still offering the deep link, which
// needs no API) rather than silently disappearing.
export default function RouteDetailsCard({ origin, destination }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await base44.functions.invoke('getRouteDetails', { origin, destination });
        if (active) setData(res.data || res);
      } catch {
        if (active) { setData(null); setFailed(true); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [origin, destination]);

  const driveUrl = data?.mapsUrl ||
    `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

  const hasTraffic = !!data?.durationInTraffic && data.durationInTraffic !== data.duration;
  const driveEstimate = data?.durationInTraffic || data?.duration || '';

  return (
    <div className="mt-4 tt-ink-panel p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <RouteIcon className="w-4 h-4 text-terra-deep" />
        <span className="tt-label text-ink-deep/50">Route details</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="tt-skeleton h-3 w-16" />
            <div className="tt-skeleton h-4 w-20" />
          </div>
          <div className="space-y-1.5">
            <div className="tt-skeleton h-3 w-16" />
            <div className="tt-skeleton h-4 w-20" />
          </div>
        </div>
      ) : failed ? (
        <div className="flex items-start gap-2.5 mb-3">
          <AlertTriangle className="w-4 h-4 text-ink-deep/40 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-deep">Route details unavailable</p>
            <p className="text-xs text-ink-deep/55 leading-relaxed">We couldn't fetch driving info right now. You can still open the route in Google Maps.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <p className="tt-label text-ink-deep/40">Distance</p>
            <p className="text-sm font-semibold text-ink-deep truncate">{data?.distance || '—'}</p>
          </div>
          <div className="min-w-0">
            <p className="tt-label text-ink-deep/40">{hasTraffic ? 'Est. drive (live)' : 'Est. drive'}</p>
            <p className="text-sm font-semibold text-ink-deep flex items-center gap-1 truncate">
              <Clock className="w-3.5 h-3.5 text-terra-deep shrink-0" />{driveEstimate || '—'}
            </p>
          </div>
        </div>
      )}

      <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep transition-colors text-sm min-h-[44px]">
        <Navigation className="w-4 h-4" /> Open driving route
      </a>
    </div>
  );
}