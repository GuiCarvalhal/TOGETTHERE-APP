import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

// Module-level set of place keys currently being resolved so concurrent card
// mounts for the same place don't fire duplicate backend calls.
const resolving = new Set();

const cacheKey = (place) => `tt-agent-photo::${place.name}::${place.address || ''}`;

// Returns a cached Google Places photo URL for an AI-suggested place. Mirrors
// usePlacePhoto: resolves once (module-level dedupe + localStorage cache so
// reloads don't re-fetch), returns null while resolving or when no photo is
// found — callers show the themed no-cover card. Agent places aren't records,
// so the cache lives in localStorage keyed by name + address.
export function useAgentPlacePhoto(place) {
  const key = place ? cacheKey(place) : null;
  const [photo, setPhoto] = useState(() => {
    if (!key) return null;
    try { return localStorage.getItem(key) || null; } catch { return null; }
  });
  useEffect(() => {
    if (!key) return;
    let active = true;
    try {
      const cached = localStorage.getItem(key);
      if (cached) { setPhoto(cached); return; }
    } catch { /* ignore */ }
    if (resolving.has(key)) return;
    resolving.add(key);
    (async () => {
      try {
        const res = await base44.functions.invoke('resolveAgentPlacePhoto', { name: place.name, address: place.address });
        const url = (res.data || res)?.photo_url;
        if (active && url) {
          setPhoto(url);
          try { localStorage.setItem(key, url); } catch { /* ignore */ }
        }
      } catch { /* ignore — placeholder stays */ }
      finally { resolving.delete(key); }
    })();
    return () => { active = false; };
  }, [key]);
  return photo;
}

export default useAgentPlacePhoto;