import { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { buildDayLegs, computeLegStates } from '@/lib/journeyDistance';

// Distance + duration for the leg between two CONSECUTIVE timeline segments.
// Builds the legs from the page's entries (each carrying a dayKey), fetches them
// in ONE batch via getJourneyLegRoutes, and returns a per-leg map keyed by
// legKey(dayKey, idx) so each between-cards row can read its own leg.
// Non-blocking: rows simply stay absent until the batch resolves. Re-fetches
// only when the leg set actually changes (a fingerprint string), so polling and
// re-renders never re-hit the API. A missing endpoint or a failed route is
// 'unknown' — never a zero-distance leg.
//
// `entries` is the timeline entries array (each { item, leg, at, dayKey }).
export function useJourneyLegDistances(entries) {
  const legs = buildDayLegs(entries);
  const fp = legs
    .map((l) => `${l.dayKey}:${l.idx}:${l.origin}:${l.destination}:${l.samePlace ? 1 : 0}`)
    .join('|');
  const fetchable = legs.filter((l) => l.origin && l.destination && !l.samePlace);

  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(() => fetchable.length > 0);
  const lastFp = useRef('');

  useEffect(() => {
    if (fp === lastFp.current) return;
    lastFp.current = fp;
    if (fetchable.length === 0) {
      setStates(computeLegStates(legs, []));
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
        if (active) setStates(computeLegStates(legs, (res.data || res).results || []));
      } catch {
        if (active) setStates(computeLegStates(legs, null));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // legs/fetchable are derived from entries; fp is their stable fingerprint.
  }, [fp]);

  return { legs: states, loading };
}

export default useJourneyLegDistances;