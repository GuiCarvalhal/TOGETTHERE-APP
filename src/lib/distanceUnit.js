import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Per-user distance unit preference ('mi' | 'km').
// Persisted on the User record via updateMe, so it follows the user across
// devices, and mirrored in component state so a change applies immediately
// without a reload. Until the user picks one, the default follows the app
// language (English → miles, Portuguese → kilometers) — the same split the
// journey distance formatter used before the preference existed.
export const DISTANCE_UNITS = ['mi', 'km'];

const normalize = (v) => (v === 'km' || v === 'mi' ? v : null);

export function useDistanceUnit() {
  const { user, refreshUser } = useAuth();
  const { locale } = useI18n();
  const stored = normalize(user?.distance_unit);
  const fallback = locale === 'pt-BR' ? 'km' : 'mi';
  const [unit, setUnitState] = useState(stored || fallback);

  useEffect(() => { if (stored) setUnitState(stored); }, [stored]);

  const setUnit = useCallback(async (next) => {
    const u = normalize(next);
    if (!u) return;
    setUnitState(u);
    await base44.auth.updateMe({ distance_unit: u });
    if (refreshUser) await refreshUser();
  }, [refreshUser]);

  return { unit, setUnit };
}