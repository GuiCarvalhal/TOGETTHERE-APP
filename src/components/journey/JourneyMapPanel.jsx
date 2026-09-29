import React from 'react';
import { MapPin, Route as RouteIcon, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JourneyRouteMap from '@/components/journey/JourneyRouteMap';
import { itemWaypoints } from '@/lib/journeyMap';

// Collapsible whole-journey route map, placed at the top of the journey list
// (directly under the sticky filter/action bar). Collapsed by default; the
// open/closed state is persisted per gathering via useViewPrefs (passed in).
// Maps exactly the items currently visible on the page (respects the
// mine/group switch). Items without coordinates are not pinned — a small,
// non-alarming note reports the count.
export default function JourneyMapPanel({ items, memberById, scope, gatheringId, open, setOpen }) {
  const mappableCount = items.filter((it) => itemWaypoints(it).length > 0).length;
  const unmappedCount = items.length - mappableCount;

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
          <span>Route</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
        <span className="text-xs text-ink-deep/55">
          {mappableCount > 0
            ? `${mappableCount} mapped stop${mappableCount === 1 ? '' : 's'}`
            : 'No mapped stops'}
        </span>
      </div>

      {open && (
        <div id="journey-route-map" className="mt-3 tt-card p-3">
          {mappableCount === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-8 px-6">
              <MapPin className="w-8 h-8 text-terra/40 mb-2" />
              <p className="text-sm text-ink-deep/70">No segments have locations to map yet.</p>
              <p className="text-xs text-ink-deep/50 mt-1">Add flights or places with resolved locations to see the route.</p>
            </div>
          ) : (
            <>
              <JourneyRouteMap
                items={items}
                memberById={memberById}
                scope={scope}
                gatheringId={gatheringId}
              />
              {unmappedCount > 0 && (
                <p className="text-[11px] text-ink-deep/50 mt-2 flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {unmappedCount} segment{unmappedCount === 1 ? '' : 's'} without a mapped location
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}