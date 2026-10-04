import { useState, useEffect } from 'react';

// Per-gathering view preferences: scope ("mine" | "group") and whether card
// cover images are shown. Persisted to localStorage so the choice survives
// navigation between the four main pages.
export function useViewPrefs(gatheringId) {
  const key = `tt-view-${gatheringId}`;
  const [scope, setScope] = useState('group');
  const [images, setImages] = useState(true);
  const [mapOpen, setMapOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  // Agent length preference — persisted per gathering/device, independent
  // of the Mine/Group scope used by Journey/Expenses. 'short' = 5+5, 'long' = 10+10.
  const [agentLength, setAgentLength] = useState('short');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.scope === 'mine' || p.scope === 'group') setScope(p.scope);
        if (typeof p.images === 'boolean') setImages(p.images);
        if (typeof p.mapOpen === 'boolean') setMapOpen(p.mapOpen);
        if (typeof p.graphOpen === 'boolean') setGraphOpen(p.graphOpen);
        if (p.agentLength === 'short' || p.agentLength === 'long') setAgentLength(p.agentLength);
      }
    } catch { /* ignore */ }
  }, [key]);

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ scope, images, mapOpen, graphOpen, agentLength })); } catch { /* ignore */ }
  }, [key, scope, images, mapOpen, graphOpen, agentLength]);

  return { scope, setScope, images, setImages, mapOpen, setMapOpen, graphOpen, setGraphOpen, agentLength, setAgentLength };
}