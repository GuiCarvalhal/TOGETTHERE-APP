// Shared overlay viewport sizing — the single source of truth for the
// route-map and expense-graph overlay dimensions. Both overlays render in
// the same StickyBar mapRow slot via PageToolbar, so they must occupy
// identical space. JourneyRouteMap and ExpenseGraphPanel both import this
// so their viewport heights can never drift.
//
// h-48 (192px) on mobile, sm:h-56 (224px) on tablet, lg:h-64 (256px) on
// desktop — matching the original JourneyRouteMap viewport exactly.
export const OVERLAY_VIEWPORT_CLASS = 'h-48 sm:h-56 lg:h-64';