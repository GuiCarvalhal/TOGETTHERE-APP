import React from 'react';

// Compact side-by-side split-method tabs (Equal / By shares / Exact). Each tab
// is a 44px touch target; selecting one updates the allocation table below.
const METHODS = [
  { key: 'equal', label: 'Equal' },
  { key: 'by_share', label: 'By shares' },
  { key: 'custom', label: 'Exact' },
];

export default function SplitMethodTabs({ value, onChange }) {
  return (
    <div className="inline-flex w-full rounded-full bg-cream-pale p-1 border border-ink-charcoal/15">
      {METHODS.map((m) => {
        const active = value === m.key;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onChange(m.key)}
            className={`flex-1 min-h-[44px] px-2 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-terra text-cream shadow-sm' : 'text-ink-deep/60 hover:text-ink-deep'}`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}