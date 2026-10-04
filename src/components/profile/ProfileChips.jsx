import React, { useMemo } from 'react';
import { resolveChip } from '@/lib/profileOptions';
import { useI18n } from '@/lib/i18n';

// Read-only chip renderer for a stored profile value array (own + other
// profile views). Known catalog values show their emoji + label; unmatched
// free-text shows as a plain custom chip (backward compat). Theme-token
// styled so it reads correctly in light and dark mode. Returns null when
// there's nothing to show so the caller's conditional wrapper still hides
// the whole section.
// dictPrefix: 'interests' | 'cuisine' — translates known catalog labels via
// the i18n dictionary; custom chips keep their original text.
export default function ProfileChips({ values, catalog, dictPrefix }) {
  const { t } = useI18n();
  const map = useMemo(() => Object.fromEntries(catalog.map((o) => [o.key, o])), [catalog]);
  const chips = (values || []).map((v) => resolveChip(v, catalog, map)).filter(Boolean);
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cream-pale text-xs text-ink-deep/80 border border-ink-charcoal/10">
          {c.emoji && <span aria-hidden>{c.emoji}</span>}{c.isCustom ? c.label : (dictPrefix ? (t(dictPrefix + '.' + c.key) || c.label) : c.label)}
        </span>
      ))}
    </div>
  );
}