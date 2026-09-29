import React from 'react';
import { MapPin, Route as RouteIcon, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JourneyRouteMap from '@/components/journey/JourneyRouteMap';
import { itemWaypoints } from '@/lib/journeyMap';

// Collapsible journey route map, placed near the top of the Journey and Agent
// pages (directly under the sticky filter/action bar). Collapsed by default;
// open/closed is persisted per gathering via useViewPrefs (passed in). Maps
// exactly the journey items visible on the page (respects the mine/group
// switch). Items without coordinates are not pinned — a small, non-alarming
// note reports the count.
//
// Optional `suggestions` (Agent page): resolved suggested-place markers layered
// on top of the journey base map. `suggestionsWithoutCoords` / `suggestionsPending`
// drive a quiet note about suggestions that couldn't be located. When none of
// `toggleLabel` is provided it defaults to "Route" (Journey page); the Agent
// page passes "Map".
export default function JourneyMapPanel({
  items, memberById, scope, gatheringId, open, setOpen,
  suggestions = [], suggestionsWithoutCoords = 0, suggestionsPending = 0, toggleLabel = 'Route',
  itemsPending = 0,
}) {
  const mappableCount = items.filter((it) => itemWaypoints(it).length > 0).length;
  const unmappedCount = items.length - mappableCount;
  const hasAnything = mappableCount > 0 || suggestions.length > 0 || suggestionsPending > 0 || itemsPending > 0;

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant={open ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="journey-route-map"
        >
          <RouteIcon className="w-4 h-4" />
          <span>{toggleLabel}</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
        <span className="text-xs text-ink-deep/55">
          {hasAnything
            ? `${mappableCount} mapped stop${mappableCount === 1 ? '' : 's'}${suggestions.length ? ` · ${suggestions.length} suggested` : ''}${itemsPending ? ` · locating ${itemsPending}` : ''}`
            : 'Nothing to map yet'}
        </span>
      </div>

      {open && (
        <div id="journey-route-map" className="mt-3 tt-card p-3">
          {!hasAnything ? (
            <div className="flex flex-col items-center justify-center text-center py-8 px-6">
              <MapPin className="w-8 h-8 text-terra/40 mb-2" />
              <p className="text-sm text-ink-deep/70">No locations to map yet.</p>
              <p className="text-xs text-ink-deep/50 mt-1">Add flights or places to your journey, or generate a brief for suggestions.</p>
            </div>
          ) : (
            <>
              <JourneyRouteMap
                items={items}
                memberById={memberById}
                scope={scope}
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
      )}
    </div>
  );
}