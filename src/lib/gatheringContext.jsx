import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const GatheringCtx = createContext(null);

export function GatheringProvider({ gatheringId, children }) {
  const [gathering, setGathering] = useState(null);
  const [members, setMembers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fab, setFab] = useState(null);

  const loadAll = useCallback(async () => {
    if (!gatheringId) return;
    setLoading(true);
    setError(null);
    try {
      const [g, ms, me] = await Promise.all([
        base44.entities.Gathering.get(gatheringId),
        base44.entities.Member.filter({ gathering_id: gatheringId }),
        base44.auth.me(),
      ]);
      setGathering(g);
      setMembers(ms);
      setCurrentUser(me);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [gatheringId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const currentMember = members.find((m) => m.user_id === currentUser?.id) || null;
  const role = currentMember?.role || null;

  const value = {
    gatheringId,
    gathering,
    setGathering,
    members,
    setMembers,
    currentMember,
    currentUser,
    role,
    loading,
    error,
    refresh: loadAll,
    fab,
    setFab,
  };

  return <GatheringCtx.Provider value={value}>{children}</GatheringCtx.Provider>;
}

export function useGathering() {
  const ctx = useContext(GatheringCtx);
  if (!ctx) throw new Error('useGathering must be used within GatheringProvider');
  return ctx;
}