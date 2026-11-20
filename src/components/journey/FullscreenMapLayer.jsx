import React, { useEffect, useLayoutEffect, useState } from 'react';
import JourneyMapPanel from '@/components/journey/JourneyMapPanel';

// Full-screen route map. The app header and the page toolbar (scope, filters,
// buttons) stay exactly where they are — this layer simply starts flush under
// the sticky toolbar and fills everything below it, including over the floating
// bottom tab bar, so the map owns the whole content area.
//
// The top edge is measured from the real toolbar element instead of a fixed
// offset: the toolbar's own height changes (filter row, and on phones the map
// row disappears while full screen), so a hardcoded value would leave a gap or
// hide the filter chips. Page scroll is locked while the layer is open.
export default function FullscreenMapLayer({
  open,
  items,
  gatheringId,
  itemsPending = 0,
  routeLegs = {},
  routesLoading = false,
  routesStale = false,
  highlightItemId = null,
}) {
  const [top, setTop] = useState(0);

  // Layout effect: the offset is resolved before the first paint, so the map
  // never flashes over the header for a frame.
  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const bar = document.querySelector('[data-sticky-toolbar]');
      setTop(bar ? Math.round(bar.getBoundingClientRect().bottom) : 0);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [open]);

  // Lock the page behind the layer so the map is the only thing that moves.
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50" style={{ top }}>
      <JourneyMapPanel
        items={items}
        gatheringId={gatheringId}
        itemsPending={itemsPending}
        routeLegs={routeLegs}
        routesLoading={routesLoading}
        routesStale={routesStale}
        highlightItemId={highlightItemId}
        className="h-full rounded-none border-0"
        heightClass="flex-1 min-h-0"
      />
    </div>
  );
}