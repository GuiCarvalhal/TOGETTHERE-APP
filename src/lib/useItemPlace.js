import { useMemo } from 'react';
import { usePlaceTimezone, usePlaceCountryCode, useTimezonesForPlaces } from '@/lib/usePlaceTimezone';
import { startLocation, endLocation, arrowFirst } from '@/lib/formatPlaceTime';

// Stored place metadata on a journey item, resolved at entry time via
// autocomplete. These return null/'' when absent (legacy free-text records),
// so callers fall back to render-time geocoding for backward compatibility.
function isRouteType(item) {
  return ['flight', 'car', 'train', 'cruise'].includes(item?.type);
}
export function itemStartTz(item) {
  if (!item) return null;
  if (isRouteType(item)) return item.from_place?.tz || item.to_place?.tz || null;
  return item.place?.tz || null;
}
export function itemEndTz(item) {
  if (!item) return null;
  if (isRouteType(item)) return item.to_place?.tz || item.from_place?.tz || null;
  return item.place?.tz || null;
}
export function itemStartCountry(item) {
  if (!item) return '';
  if (isRouteType(item)) return item.from_place?.country || item.to_place?.country || '';
  return item.place?.country || '';
}
export function itemEndCountry(item) {
  if (!item) return '';
  if (isRouteType(item)) return item.to_place?.country || item.from_place?.country || '';
  return item.place?.country || '';
}

// Per-item hooks. They prefer the stored place tz/country (instant, no geocode)
// and only fall back to render-time geocoding for legacy records — and for
// those, they geocode the FIRST segment before the arrow so an arrow-style
// route like "Bomerano → Nocelle" resolves instead of rendering blank.
// When a stored tz exists the fallback hook is given '' so it never fires.
export function useItemStartTz(item) {
  const stored = itemStartTz(item);
  const fallback = usePlaceTimezone(stored ? '' : arrowFirst(startLocation(item)));
  return stored || fallback || null;
}
export function useItemEndTz(item) {
  const stored = itemEndTz(item);
  const fallback = usePlaceTimezone(stored ? '' : arrowFirst(endLocation(item)));
  return stored || fallback || null;
}
export function useItemStartCountry(item) {
  const stored = itemStartCountry(item);
  const fallback = usePlaceCountryCode(stored ? '' : arrowFirst(startLocation(item)));
  return stored || fallback || '';
}
export function useItemEndCountry(item) {
  const stored = itemEndCountry(item);
  const fallback = usePlaceCountryCode(stored ? '' : arrowFirst(endLocation(item)));
  return stored || fallback || '';
}

// Batch hook for the journey list: many items -> { [item.id]: startTz }. Stored
// tzs are instant; only legacy items (no stored place) are geocoded, and those
// use the arrow-first segment. Used for day grouping so new items never
// re-geocode and legacy arrow routes still land on the right day.
export function useItemStartTzMap(items) {
  const list = items || [];
  const legacyPlaces = useMemo(
    () => list.filter((it) => !itemStartTz(it)).map((it) => arrowFirst(startLocation(it))).filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.map((it) => it.id).join('|')]
  );
  const legacyMap = useTimezonesForPlaces(legacyPlaces);
  return useMemo(() => {
    const m = {};
    list.forEach((it) => {
      const stored = itemStartTz(it);
      m[it.id] = stored || legacyMap[arrowFirst(startLocation(it))] || null;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.map((it) => it.id).join('|'), legacyMap]);
}