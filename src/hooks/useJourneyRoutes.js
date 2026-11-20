import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDayLegs, computeLegStates } from '@/lib/journeyDistance';
import { fetchRouteLegs, getCachedRoute, isRouteFresh, routeLegKey } from '@/lib/journeyRoutes';
import { useConnectivity } from '@/lib/useConnectivity';

// ONE Directions fetch for the whole screen.
//
// Two consumers need the same legs: the travel rows between consecutive cards
// (distance + duration) and the route map (the driving geometry). Asking for
// both in a single request is what stops a page from costing two Directions
// calls, and the session cache (lib/journeyRoutes) is what stops a re-render
// from costing any: a leg already resolved for the same two endpoints is
// reused, so adding, deleting, reordering or moving one item only asks Google
// about the legs that actually changed. `refresh()` re-measures everything.
export function useJourneyRoutes({ entries = [], mapLegs = [], mapEnabled = false }) {
  const { online } = useConnectivity();
  const timelineLegs = buildDayLegs(entries);
  const fetchable = timelineLegs.filter((l) => l.origin && l.destination && !l.samePlace);
  // Flights are drawn straight, so only the driving legs need a Directions
  // answer — asking for a flight's own leg would spend a call for a line the
  // map never reads.
  const neededMapLegs = mapEnabled ? mapLegs.filter((l) => l.kind === 'drive') : [];

  const timelineFp = fetchable.map((l) => `${l.origin}>${l.destination}`).join('|');
  const mapFp = neededMapLegs.map((l) => `${l.origin}>${l.destination}`).join('|');

  // Every distinct leg this screen needs, keyed by its routable endpoints.
  const wanted = useMemo(() => {
    const byKey = new Map();
    const add = (leg) => {
      if (!leg || !leg.origin || !leg.destination) return;
      byKey.set(routeLegKey(leg.origin, leg.destination), { origin: leg.origin, destination: leg.destination });
    };
    fetchable.forEach(add);
    neededMapLegs.forEach(add);
    return [...byKey.values()];
  }, [timelineFp, mapFp]);

  // Latest derived lists for the effect, so it depends only on the fingerprints.
  const timelineRef = useRef(timelineLegs);
  timelineRef.current = timelineLegs;
  const fetchableRef = useRef(fetchable);
  fetchableRef.current = fetchable;

  const [legStates, setLegStates] = useState({});
  const [routes, setRoutes] = useState({});
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);
  const lastRunRef = useRef('');

  const statesFrom = (byKey) => computeLegStates(
    timelineRef.current,
    fetchableRef.current.map((l) => byKey[routeLegKey(l.origin, l.destination)]),
  );

  const cachedFor = (list) => {
    const out = {};
    list.forEach((l) => {
      const entry = getCachedRoute(l.origin, l.destination, { allowStale: true });
      if (entry) out[routeLegKey(l.origin, l.destination)] = entry;
    });
    return out;
  };

  useEffect(() => {
    const runKey = `${timelineFp}#${mapFp}#${online ? 1 : 0}#${nonce}`;
    if (lastRunRef.current === runKey) return;
    lastRunRef.current = runKey;
    const force = forceRef.current;
    forceRef.current = false;

    if (wanted.length === 0) {
      setLegStates(computeLegStates(timelineRef.current, []));
      setRoutes({});
      setLoading(false);
      setStale(false);
      return;
    }

    // Offline: never call Google. Show what the session cache still holds and
    // let the map say the routes/times may be outdated.
    if (!online) {
      const cached = cachedFor(wanted);
      const allFresh = wanted.every((l) => isRouteFresh(cached[routeLegKey(l.origin, l.destination)]));
      setRoutes(cached);
      setLegStates(statesFrom(cached));
      setStale(!allFresh);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    (async () => {
      try {
        const { byKey } = await fetchRouteLegs(wanted, { force });
        if (!active) return;
        setRoutes(byKey);
        setLegStates(statesFrom(byKey));
        setStale(false);
      } catch {
        if (!active) return;
        const cached = cachedFor(wanted);
        setRoutes(cached);
        setLegStates(statesFrom(cached));
        setStale(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [timelineFp, mapFp, online, nonce]);

  const refresh = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { legStates, routes, loading, stale, refresh, online };
}

export default useJourneyRoutes;