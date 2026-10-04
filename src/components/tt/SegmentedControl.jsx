import React from 'react';

// Shared toolbar segmented control — the single source for the LEFT selector
// slot's pill capsule. Used by ScopeSwitcher (Mine/Group), DetailSwitcher
// (Summary/Details) and the Agent length switcher (Short/Long). Every page gets
// the exact same outer pill, inner-button dimensions, gap, border, radius,
// selected/unselected treatment and focus ring, so the toolbar reads as one
// family of controls across Journey / Expenses / Members / Agent.
//
// options: [{ key, label?, icon?, ariaLabel? }]
//   - label:  visible text (omitted for icon-only options, e.g. Agent Short/Long)
//   - icon:   optional icon node; the button sizes it w-3.5 h-3.5 via [&_svg]
//   - ariaLabel: accessible name (falls back to label)
// value: active key; onChange(key)
export default function SegmentedControl({ options, value, onChange, ariaLabel, className = '' }) {
  return (
    <div
      className={`inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10 shrink-0 ${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = value === o.key;
        const name = o.ariaLabel || o.label;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            aria-label={name}
            title={name}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 ${active ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
          >
            {o.icon}
            {o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}