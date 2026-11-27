import React, { useEffect, useRef } from 'react';

// Shared secondary filter chip row — mirrors the Agent page's category pills
// exactly (dimensions, selected state, spacing, theme tokens). Rendered as
// the `filterRow` of PageToolbar, which places it in the StickyBar footer row
// (horizontally scrollable, tt-no-scrollbar) so it stays pinned with the
// toolbar and scrolls flush under the TopBar.
//
// Horizontal overflow behavior:
//   - Each chip is `shrink-0` + `whitespace-nowrap`, so when the row is wider
//     than the viewport the chips keep their natural width and the StickyBar
//     scroll container scrolls horizontally instead of compressing them.
//   - The active chip is brought into view on change by moving its OWN
//     horizontal container only (never scrollIntoView, which also scrolls the
//     window vertically on iOS and yanked the Journey landing out of place a
//     moment after it had settled).
//   - The scroll container (StickyBar footer) carries overflow-x-auto,
//     overflow-y-hidden, touch-pan-x and tt-no-scrollbar — no visible
//     scrollbar, touch-momentum panning, vertical page scroll preserved.
//
// `options`: [{ key, label }]; `value`: active key; `onChange`: setter.
// Returns an array of buttons (direct children of the StickyBar footer), so
// PageToolbar renders them as direct children of its flex footer.
export default function FilterChips({ options, value, onChange }) {
  const activeRef = useRef(null);
  useEffect(() => {
    const el = activeRef.current;
    const box = el && el.parentElement;
    if (!el || !box || box.scrollWidth <= box.clientWidth + 1) return;
    // Horizontal only, on the container: the page itself never moves.
    const boxRect = box.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const left = rect.left - boxRect.left;
    if (left < 0) box.scrollLeft += left - 8;
    else if (rect.right > boxRect.right) box.scrollLeft += rect.right - boxRect.right + 8;
  }, [value]);
  return options.map((o) => (
    <button
      key={o.key}
      ref={value === o.key ? activeRef : null}
      onClick={() => onChange(o.key)}
      aria-pressed={value === o.key}
      className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${value === o.key ? 'bg-terra text-cream' : 'bg-foreground/5 text-foreground/70 hover:text-foreground border border-foreground/10'}`}
    >
      {o.label}
    </button>
  ));
}