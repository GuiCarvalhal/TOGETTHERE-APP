import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Navigation, Route as RouteIcon, Clock } from 'lucide-react';

// Driving distance + duration between origin and destination (Google Maps
// Directions). Renders nothing while loading or on failure. Includes a
// deep link to the full driving route (origin -> destination).
export default function RouteDetailsCard({ origin, destination }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('getRouteDetails', { origin, destination });
        if (active) setData(res.data || res);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [origin, destination]);

  if (loading || !data || (!data.distance && !data.duration)) return null;

  const driveUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;

  return (
    <div className="mt-4 tt-ink-panel p-3.5">
      <div className="flex items-center gap-2 mb-2.5">
        <RouteIcon className="w-4 h-4 text-terra-deep" />
        <span className="tt-label text-ink-deep/50">Route details</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="tt-label text-ink-deep/40">Distance</p>
          <p className="text-sm font-semibold text-ink-deep truncate">{data.distance || '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="tt-label text-ink-deep/40">Est. drive</p>
          <p className="text-sm font-semibold text-ink-deep flex items-center gap-1 truncate"><Clock className="w-3.5 h-3.5 text-terra-deep shrink-0" />{data.duration || '—'}</p>
        </div>
      </div>
      <a href={driveUrl} target="_blank" rel="noopener noreferrer" className="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-terra text-cream font-semibold hover:bg-terra-deep transition-colors text-sm min-h-[44px]">
        <Navigation className="w-4 h-4" /> Open driving route
      </a>
    </div>
  );
}