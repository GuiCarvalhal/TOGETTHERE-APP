import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const GatheringCtx = createContext(null);

export function GatheringProvider({ gatheringId, children }) {
  const [gathering, setGathering] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fab, setFab] = useState(null);
  const [joinRequests, setJoinRequests] = useState([]);
  // Minimal journey items for the gathering, used to derive the gathering's
  // date range in the header. The Journey page fetches its own full items
  // (with polling); this is just the header's derivation source.
  const [journeyItems, setJourneyItems] = useState([]);

  const load = useCallback(async (silent) => {
    if (!gatheringId) return;
    if (!silent) { setLoading(true); setError(null); }
    try {
      const res = await base44.functions.invoke('getGatheringContext', { gathering_id: gatheringId });
      const data = res.data || res;
      setGathering(data.gathering);
      setMembers(data.members || []);
      setCurrentMember(data.currentMember || null);
      setJoinRequests(data.joinRequests || []);
      setJourneyItems(data.journeyItems || []);
    } catch (e) {
      if (!silent) setError(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [gatheringId]);

  useEffect(() => { load(); }, [load]);

  const role = currentMember?.role || null;

  const value = {
    gatheringId,
    gathering,
    setGathering,
    members,
    setMembers,
    currentMember,
    role,
    loading,
    error,
    refresh: load,
    silentRefresh: () => load(true),
    fab,
    setFab,
    joinRequests,
    setJoinRequests,
    journeyItems,
  };

  return <GatheringCtx.Provider value={value}>{children}</GatheringCtx.Provider>;
}

export function useGathering() {
  const ctx = useContext(GatheringCtx);
  if (!ctx) throw new Error('useGathering must be used within GatheringProvider');
  return ctx;
}