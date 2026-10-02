import { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import flightEnrichmentInput from '@/lib/flightEnrichmentInput';
import createFlightEnrichmentCache from '@/lib/flightEnrichmentCache';

const load = createFlightEnrichmentCache(payload => base44.functions.invoke('resolveFlightEnrichment', payload));

export function useFlightEnrichment(item) {
  const input = flightEnrichmentInput(item);
  const { key, needsFetch, payload } = input;
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!needsFetch) { setState(null); return; }
    let active = true;
    let timer;
    async function refresh() {
      setState(previous => ({ key, data: previous?.key === key ? previous.data : null, loading: true }));
      const data = await load(key, payload);
      if (!active) return;
      setState({ key, data, loading: false });
      if (data.retryAt > Date.now()) timer = setTimeout(refresh, data.retryAt - Date.now());
    }
    refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [key, needsFetch]);
  const current = state?.key === key ? state : null;
  const data = current?.data;
  const errors = data?.errors || [];
  return {
    airline: input.airline || data?.airline || '',
    fromCity: input.fromCity || data?.from_city || '',
    toCity: input.toCity || data?.to_city || '',
    loading: needsFetch && (current?.loading ?? true),
    errors, warnings: data?.warnings || [],
    error: errors.map(issue => `${issue.source}: ${issue.message}`).join(' '),
  };
}
export default useFlightEnrichment;