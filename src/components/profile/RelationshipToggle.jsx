import React from 'react';
import { Heart, User } from 'lucide-react';

// Close / Casual sharing-level toggle. `value` is the viewer's own level toward
// the target; onChange(level) persists it. Full-width pill for the Profile page.
export default function RelationshipToggle({ value, onChange, disabled = false }) {
  return (
    <div className="inline-flex rounded-full bg-cream-pale p-0.5 border border-ink-charcoal/15 w-full">
      {['casual', 'close'].map((rel) => {
        const active = value === rel;
        const Icon = rel === 'close' ? Heart : User;
        return (
          <button
            key={rel}
            type="button"
            disabled={disabled}
            onClick={() => onChange(rel)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-full text-sm font-semibold capitalize transition-colors disabled:opacity-50 ${active ? (rel === 'close' ? 'bg-terra text-cream' : 'bg-ink-deep/10 text-ink-deep') : 'text-ink-deep/55 hover:text-ink-deep'}`}
          >
            <Icon className="w-4 h-4" /> {rel}
          </button>
        );
      })}
    </div>
  );
}