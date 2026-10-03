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
// `storedOnly` (default false): when true, never geocode at render — return
// the stored place tz/country only (null/'' when absent). Flight cards pass
// storedOnly=true so opening the journey list makes ZERO Google/AeroDataBox
// requests; non-flight cards and the detail page keep the legacy geocoding
// fallback for free-text records.
export function useItemStartTz(item, storedOnly = false) {
  const stored = itemStartTz(item);
  const fallback = usePlaceTimezone((stored || storedOnly) ? '' : arrowFirst(startLocation(item)));
  return stored || fallback || null;
}
export function useItemEndTz(item, storedOnly = false) {
  const stored = itemEndTz(item);
  const fallback = usePlaceTimezone((stored || storedOnly) ? '' : arrowFirst(endLocation(item)));
  return stored || fallback || null;
}
export function useItemStartCountry(item, storedOnly = false) {
  const stored = itemStartCountry(item);
  const fallback = usePlaceCountryCode((stored || storedOnly) ? '' : arrowFirst(startLocation(item)));
  return stored || fallback || '';
}
export function useItemEndCountry(item, storedOnly = false) {
  const stored = itemEndCountry(item);
  const fallback = usePlaceCountryCode((stored || storedOnly) ? '' : arrowFirst(endLocation(item)));
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