import { useEffect, useState } from 'react';

// Measured height of the pinned PageToolbar (StickyBar is tagged with
// data-sticky-toolbar). The desktop two-column pages pin their side panel with
// the EXACT same offset, so header + filters + panel read as one fixed block:
// the panel never has movement of its own, only the card column scrolls.
export function useStickyBarHeight(enabled = true, fallback = 92) {
  const [barH, setBarH] = useState(fallback);

  useEffect(() => {
    if (!enabled) return;
    const el = document.querySelector('[data-sticky-toolbar]');
    if (!el) return;
    const update = () => setBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);

  return barH;
}

// Distance from the viewport top to the bottom edge of the pinned toolbar:
// TopBar (3rem) + notch inset + the live toolbar height.
export function deskTopOffset(barH) {
  return `calc(3rem + env(safe-area-inset-top) + ${barH}px)`;
}

// Exact height of the band between that pinned toolbar and the floating bottom
// dock, so a pinned panel fits the viewport with no overflow — hence no inner
// scroll of its own.
export function deskPanelHeight() {
  return 'calc(100dvh - var(--tt-desk-top) - 5rem - env(safe-area-inset-bottom))';
}

export default useStickyBarHeight;