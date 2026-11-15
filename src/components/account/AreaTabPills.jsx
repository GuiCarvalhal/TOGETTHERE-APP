import React from 'react';

// Compact section toggles for an account area's sticky bar. Sits on the right of
// the orange Back button and scrolls horizontally when four labels don't fit a
// narrow phone, so the bar stays useful instead of empty.
export default function AreaTabPills({ items, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 rounded-full bg-foreground/5 p-1 border border-foreground/10 shrink-0">
      {items.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`px-2 py-1 rounded-full text-[0.625rem] font-semibold whitespace-nowrap transition-colors ${
            value === key ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}