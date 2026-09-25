import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import { splitSelected } from '@/lib/profileOptions';

// Multi-select chip/toggle picker driven by a curated catalog (profile edit).
// Tap a catalog option to toggle it; unmatched stored free-text values render
// as removable custom chips so existing data is never lost (backward compat).
// Emits an array of canonical catalog keys + any remaining custom strings.
//
// Accessibility: each option is a real <button> with aria-pressed; focus ring
// via theme tokens. max is a soft limit — selecting beyond it shows a gentle
// warning but never blocks, per spec.
export default function ChipPicker({ catalog, value = [], onChange, max = 8, emptyHint }) {
  const map = useMemo(() => Object.fromEntries(catalog.map((o) => [o.key, o])), [catalog]);
  const { keys, customs } = useMemo(() => splitSelected(value, catalog, map), [value, catalog, map]);
  const count = keys.length + customs.length;

  function toggle(key) {
    const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key];
    onChange([...next, ...customs]);
  }
  function removeCustom(c) {
    onChange([...keys, ...customs.filter((x) => x !== c)]);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {catalog.map((o) => {
          const selected = keys.includes(o.key);
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={selected}
              onClick={() => toggle(o.key)}
              className={`inline-flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full text-xs font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.97] ${selected ? 'bg-terra text-cream border-terra' : 'bg-foreground/5 text-foreground/80 border-foreground/12 hover:bg-foreground/10'}`}
            >
              <span aria-hidden>{o.emoji}</span>{o.label}
            </button>
          );
        })}
      </div>

      {customs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {customs.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-cream-pale text-ink-deep/80 text-xs border border-ink-charcoal/15">
              {c}
              <button type="button" onClick={() => removeCustom(c)} aria-label={`Remove ${c}`} className="w-4 h-4 rounded-full hover:bg-ink-deep/10 flex items-center justify-center"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      {count === 0 && emptyHint && <p className="text-[0.625rem] text-foreground/45 mt-2">{emptyHint}</p>}
      {count > max && <p className="text-[0.625rem] text-terra-deep mt-2">Heads up — pick a few favorites. Too many dilutes your matches.</p>}
    </div>
  );
}