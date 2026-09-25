import React, { useMemo } from 'react';
import { resolveChip } from '@/lib/profileOptions';

// Read-only chip renderer for a stored profile value array (own + other
// profile views). Known catalog values show their emoji + label; unmatched
// free-text shows as a plain custom chip (backward compat). Theme-token
// styled so it reads correctly in light and dark mode. Returns null when
// there's nothing to show so the caller's conditional wrapper still hides
// the whole section.
export default function ProfileChips({ values, catalog }) {
  const map = useMemo(() => Object.fromEntries(catalog.map((o) => [o.key, o])), [catalog]);
  const chips = (values || []).map((v) => resolveChip(v, catalog, map)).filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream-pale text-xs text-ink-deep/80 border border-ink-charcoal/10">
          {c.emoji && <span aria-hidden>{c.emoji}</span>}{c.label}
        </span>
      ))}
    </div>
  );
}