import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { buildDayLegs, computeDayTotals } from '@/lib/journeyDistance';

// Per-day driving distance + duration between consecutive timeline segments.
// Builds the inter-segment legs from the page's entries (each carrying a
// dayKey), fetches them in ONE batch via getJourneyLegRoutes, and folds the
// results into per-day totals. Non-blocking: returns a loading flag and
// populates totals when the call resolves. Re-fetches only when the leg set
// actually changes (a fingerprint string), so polling and re-renders never
// re-hit the API. Unknown legs (a missing endpoint or a failed route) never
// count as zero — the day is marked 'partial' or 'unavailable' instead.
//
// `entries` is the timeline entries array (each { item, leg, at, dayKey }).
export function useJourneyDayTotals(entries) {
  const legs = buildDayLegs(entries);
  const fp = legs
    .map((l) => `${l.dayKey}:${l.origin}:${l.destination}:${l.samePlace ? 1 : 0}`)
    .join('|');
  const fetchable = legs.filter((l) => l.origin && l.destination && !l.samePlace);

  const [totals, setTotals] = useState(() => computeDayTotals(legs, []));
  const [loading, setLoading] = useState(() => fetchable.length > 0);
  const lastFp = useRef('');

  useEffect(() => {
    if (fp === lastFp.current) return;
    lastFp.current = fp;
    if (fetchable.length === 0) {
      setTotals(computeDayTotals(legs, []));
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const res = await base44.functions.invoke('getJourneyLegRoutes', {
          legs: fetchable.map((l) => ({ origin: l.origin, destination: l.destination })),
        });
        if (active) setTotals(computeDayTotals(legs, (res.data || res).results || []));
      } catch {
        if (active) setTotals(computeDayTotals(legs, null));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // legs/fetchable are derived from entries; fp is their stable fingerprint.
  }, [fp]);

  return { totals, loading };
}

export default useJourneyDayTotals;