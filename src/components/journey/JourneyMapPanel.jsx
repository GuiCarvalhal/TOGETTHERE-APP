import React from 'react';
import { MapPin, Loader2 } from 'lucide-react';
import JourneyRouteMap from '@/components/journey/JourneyRouteMap';
import { itemWaypoints } from '@/lib/journeyMap';

// The route-map surface. ONE panel, ONE border: the map sits flush inside it and
// a single hairline footer strip carries the quiet "locating / unmapped" notes.
// Previously the panel was a card with padding wrapped around a second bordered
// map, which left a 12px inset gutter (map edges not aligned with the list
// beside it) and stacked note lines under an asymmetric bottom padding. Now the
// panel's edges are the map's edges, so it embeds cleanly in a column.
//
// Used in two places:
//  - Journey/Agent desktop: the pinned right-hand panel (fixed height band, no
//    inner scroll — the map flexes to fill, the strip stays put).
//  - Phone + portrait tablet: the mapRow inside the sticky bar (auto height,
//    map keeps its shared OVERLAY_VIEWPORT_CLASS height).
//
// Optional `suggestions` (Agent page): resolved suggested-place markers layered
// on top of the journey base map. The Journey page passes no suggestions.
export default function JourneyMapPanel({
  items, gatheringId,
  suggestions = [], suggestionsWithoutCoords = 0, suggestionsPending = 0, itemsPending = 0,
  heightClass, highlightItemId = null, className = '', style,
}) {
  const mappableCount = items.filter((it) => itemWaypoints(it).length > 0).length;
  const unmappedCount = items.length - mappableCount;
  const hasAnything = mappableCount > 0 || suggestions.length > 0 || suggestionsPending > 0 || itemsPending > 0;

  // Consolidated into one compact strip instead of stacked paragraphs.
  const notes = [];
  if (itemsPending > 0) notes.push({ key: 'items', spin: true, text: `Locating ${itemsPending} segment${itemsPending === 1 ? '' : 's'}…` });
  if (itemsPending === 0 && unmappedCount > 0) notes.push({ key: 'unmapped', text: `${unmappedCount} segment${unmappedCount === 1 ? '' : 's'} without a mapped location` });
  if (suggestionsPending > 0) notes.push({ key: 'sugg', spin: true, text: `Locating ${suggestionsPending} suggestion${suggestionsPending === 1 ? '' : 's'}…` });
  if (suggestionsPending === 0 && suggestionsWithoutCoords > 0) notes.push({ key: 'suggMissing', text: `${suggestionsWithoutCoords} suggestion${suggestionsWithoutCoords === 1 ? '' : 's'} without a location` });

  return (
    <div className={`flex flex-col overflow-hidden rounded-2xl border border-ink-charcoal/15 bg-card ${className}`} style={style}>
      {!hasAnything ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <MapPin className="w-6 h-6 text-terra/40 mb-1.5" />
          <p className="text-xs text-ink-deep/70">No locations to map yet.</p>
          <p className="text-[11px] text-ink-deep/50 mt-0.5">Add flights or places to your journey to see them here.</p>
        </div>
      ) : (
        <>
          <JourneyRouteMap
            bare
            items={items}
            gatheringId={gatheringId}
            suggestions={suggestions}
            heightClass={heightClass}
            highlightItemId={highlightItemId}
          />
          {notes.length > 0 && (
            <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-charcoal/10 px-3.5 py-2">
              {notes.map((n) => (
                <p key={n.key} className="text-[11px] text-ink-deep/55 flex items-center gap-1">
                  {n.spin
                    ? <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                    : <MapPin className="w-3 h-3 shrink-0" />}
                  {n.text}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}