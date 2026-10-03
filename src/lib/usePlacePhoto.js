import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Item ids currently being resolved (module-level) so concurrent card mounts
// for the same item don't fire duplicate backend calls.
const resolving = new Set();

function canResolve(item) {
  if (!item?.id || !item?.type) return false;
  if (['hotel', 'activity'].includes(item.type)) return !!item.location_name;
  if (['flight', 'car', 'train', 'cruise'].includes(item.type)) return !!(item.location_to || item.location_from);
  return false;
}

// Returns a cached Google Places photo URL for a journey item. Resolves it once
// on the server (searchText → photo media → public upload, persisted on the
// record) so subsequent renders never re-fetch. Returns null while resolving
// or for items with no resolvable place — callers show the themed placeholder.
// `storedOnly` (default false): when true, return the persisted place_photo
// only and never resolve at render. Flight cards pass storedOnly=true so
// opening the journey list makes ZERO Google Places photo requests; the card
// falls back to the themed placeholder when no photo is stored.
export function usePlacePhoto(item, storedOnly = false) {
  const [photo, setPhoto] = useState(item?.place_photo || null);
  useEffect(() => {
    if (!item?.id) return;
    if (item.place_photo) { setPhoto(item.place_photo); return; }
    if (storedOnly) return;
    if (!canResolve(item) || resolving.has(item.id)) return;
    resolving.add(item.id);
    let active = true;
    (async () => {
      try {
        const res = await base44.functions.invoke('resolvePlacePhoto', { item_id: item.id });
        const url = (res.data || res)?.photo_url;
        if (active && url) setPhoto(url);
      } catch {
        /* ignore — placeholder stays */
      } finally {
        resolving.delete(item.id);
      }
    })();
    return () => { active = false; };
  }, [item?.id, item?.place_photo, storedOnly]);
  return photo;
}

export default usePlacePhoto;