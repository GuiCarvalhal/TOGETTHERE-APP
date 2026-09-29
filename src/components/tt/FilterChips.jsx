import React from 'react';

// Shared secondary filter chip row — mirrors the Agent page's category pills
// exactly (dimensions, selected state, spacing, overflow behavior, theme
// tokens). Rendered as the `filterRow` of PageToolbar, which places it in the
// StickyBar footer row (horizontally scrollable, tt-no-scrollbar) so it stays
// pinned with the toolbar and scrolls flush under the TopBar.
//
// `options`: [{ key, label }]; `value`: active key; `onChange`: setter.
// Returns an array of buttons (same shape the Agent passes inline), so
// PageToolbar renders them as direct children of its flex footer.
export default function FilterChips({ options, value, onChange }) {
  return options.map((o) => (
    <button
      key={o.key}
      onClick={() => onChange(o.key)}
      aria-pressed={value === o.key}
      className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${value === o.key ? 'bg-terra text-cream' : 'bg-foreground/5 text-foreground/70 hover:text-foreground border border-foreground/10'}`}
    >
      {o.label}
    </button>
  ));
}