import React from 'react';

// Stream switch for the Inbox page: Journey (imported reservations) or Expenses
// (imported bank/card transactions). Same pill treatment as the app's other
// toolbar selectors, but with visible text labels so both streams are named.
// options: [{ key, label, icon? }]
export default function InboxStreamSwitch({ value, onChange, options, ariaLabel }) {
  return (
    <div
      className="inline-flex w-full sm:w-auto rounded-full bg-foreground/5 border border-foreground/10 p-1 gap-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={active}
            className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 min-h-[36px] rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&_svg]:w-3.5 [&_svg]:h-3.5 [&_svg]:shrink-0 ${active ? 'bg-terra text-cream' : 'text-foreground/60 hover:text-foreground'}`}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}