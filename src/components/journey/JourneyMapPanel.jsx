import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import JourneyRouteMap from '@/components/journey/JourneyRouteMap';
import { itemWaypoints } from '@/lib/journeyMap';

// The route-map row, rendered inside the sticky filter bar (via PageToolbar's
// mapRow slot) when the map toggle is ON. No toggle/header here — the toggle
// lives in the bar; this is just the map + its quiet status notes. Maps exactly
// the journey items visible on the page (the page applies the mine/group
// switch before passing items in).
//
// Optional `suggestions` (Agent page): resolved suggested-place markers layered
// on top of the journey base map; a compact in-map legend distinguishes
// "Your itinerary" (terra) from "Suggested" (indigo). The Journey page passes
// no suggestions, so no legend renders there.
export default function JourneyMapPanel({
  items, gatheringId,
  suggestions = [], suggestionsWithoutCoords = 0, suggestionsPending = 0, itemsPending = 0,
}) {
  const mappableCount = items.filter((it) => itemWaypoints(it).length > 0).length;
  const unmappedCount = items.length - mappableCount;
  const hasAnything = mappableCount > 0 || suggestions.length > 0 || suggestionsPending > 0 || itemsPending > 0;

  return (
    <div className="tt-card p-3">
      {!hasAnything ? (
        <div className="flex flex-col items-center justify-center text-center py-5 px-4">
          <MapPin className="w-6 h-6 text-terra/40 mb-1.5" />
          <p className="text-xs text-ink-deep/70">No locations to map yet.</p>
          <p className="text-[11px] text-ink-deep/50 mt-0.5">Add flights or places to your journey to see them here.</p>
        </div>
      ) : (
        <>
          <JourneyRouteMap
            items={items}
            gatheringId={gatheringId}
            suggestions={suggestions}
          />
          <div className="mt-2 space-y-1">
            {itemsPending > 0 && (
              <p className="text-[11px] text-ink-deep/50 flex items-center gap-1">
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                Locating {itemsPending} segment{itemsPending === 1 ? '' : 's'}…
              </p>
            )}
            {itemsPending === 0 && unmappedCount > 0 && (
              <p className="text-[11px] text-ink-deep/50 flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {unmappedCount} segment{unmappedCount === 1 ? '' : 's'} without a mapped location
              </p>
            )}
            {suggestionsPending > 0 && (
              <p className="text-[11px] text-ink-deep/50 flex items-center gap-1">
                <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                Locating {suggestionsPending} suggestion{suggestionsPending === 1 ? '' : 's'}…
              </p>
            )}
            {suggestionsPending === 0 && suggestionsWithoutCoords > 0 && (
              <p className="text-[11px] text-ink-deep/50 flex items-center gap-1">
                <MapPin className="w-3 h-3 shrink-0" />
                {suggestionsWithoutCoords} suggestion{suggestionsWithoutCoords === 1 ? '' : 's'} without a location
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}