import { useState, useEffect } from 'react';

// Per-gathering view preferences: scope ("mine" | "group") and whether card
// cover images are shown. Persisted to localStorage so the choice survives
// navigation between the four main pages.
export function useViewPrefs(gatheringId) {
  const key = `tt-view-${gatheringId}`;
  const [scope, setScope] = useState('group');
  const [images, setImages] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.scope === 'mine' || p.scope === 'group') setScope(p.scope);
        if (typeof p.images === 'boolean') setImages(p.images);
        if (typeof p.mapOpen === 'boolean') setMapOpen(p.mapOpen);
      }
    } catch { /* ignore */ }
  }, [key]);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ scope, images, mapOpen })); } catch { /* ignore */ }
  }, [key, scope, images]);

  return { scope, setScope, images, setImages, mapOpen, setMapOpen };
}