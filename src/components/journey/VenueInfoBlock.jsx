import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Star } from 'lucide-react';

// Compact venue info (star rating, review count, 1-line editorial summary)
// for a stay/activity backed by a Google Place. Renders nothing on failure.
export default function VenueInfoBlock({ query }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const res = await base44.functions.invoke('getPlaceInfo', { query });
        if (active) setData(res.data || res);
      } catch {
        if (active) setData(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [query]);

  if (loading || !data || (data.rating == null && !data.summary)) return null;

  return (
    <div className="mt-3 flex items-start gap-2.5 tt-ink-panel p-3">
      {data.rating != null && (
        <div className="flex items-center gap-1 shrink-0 px-2 py-1 rounded-full bg-terra/10 border border-terra/25">
          <Star className="w-3.5 h-3.5 text-terra-deep fill-terra/30" />
          <span className="text-sm font-bold text-ink-deep">{data.rating.toFixed(1)}</span>
          {data.reviews != null && <span className="text-[0.625rem] text-ink-deep/50">({data.reviews})</span>}
        </div>
      )}
      {data.summary && <p className="text-xs text-ink-deep/65 leading-relaxed line-clamp-2 min-w-0">{data.summary}</p>}
    </div>
  );
}