import { useResolvedCoords } from './useResolvedCoords';

// Stable cache key for a suggestion place (name + address). Exported so the
// Agent page can look up resolved coords in the map returned by the hook.
export const agentPlaceKey = (place) => `${place?.name || ''}::${place?.address || ''}`;

const STORAGE_PREFIX = 'tt-agent-coords::';

// Resolves { lat, lng } for a list of AI-suggested places via the EXISTING
// getPlaceInfo backend function — the same path the Agent place-detail page
// uses. Thin wrapper over the shared useResolvedCoords engine: localStorage
// cache (keyed by name+address), module-dedupe, concurrency cap. Returns
// { coords, pending }. Pass an empty array when collapsed to avoid all work.
export function useAgentPlaceCoords(places) {
  return useResolvedCoords(places || [], {
    keyFn: agentPlaceKey,
    queryFn: (p) => (p.address ? `${p.name}, ${p.address}` : p.name),
    storagePrefix: STORAGE_PREFIX,
  });
}

export default useAgentPlaceCoords;