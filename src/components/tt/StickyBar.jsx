import React from 'react';

// Shared sticky action strip — the single source for the flush-under-TopBar
// treatment used by PageToolbar (Journey/Expenses/Members/Agent) and the
// journey item detail action bar. Same sticky offset, opaque background,
// hairline border and z-index, so every toolbar page inherits identical
// chrome and navigation feels continuous.
//
// Sticky offset: TopBar is h-12 (3rem) + env(safe-area-inset-top), so the bar
// pins at calc(3rem + env(safe-area-inset-top)) — directly below it. Opaque
// (bg-background) at z-30 (below TopBar's z-40) so content scrolls cleanly
// underneath and never shows through.
//
// `footer` is an optional second row (e.g. a horizontal filter-pill strip)
// rendered below the main action row; omitted by default so existing callers
// are unchanged.
export default function StickyBar({ children, footer, className = '' }) {
  return (
    <div
      className={`-mx-4 sm:-mx-6 sticky top-[calc(3rem+env(safe-area-inset-top))] z-30 bg-background border-b border-foreground/8 ${className}`}
    >
      <div className="px-4 sm:px-6 py-2.5 flex items-center gap-3">{children}</div>
      {footer && <div className="px-4 sm:px-6 pb-2.5 flex items-center gap-2 overflow-x-auto tt-no-scrollbar">{footer}</div>}
    </div>
  );
}