import React from 'react';
import { Loader2 } from 'lucide-react';

// One Home metric card: a number on top of a short label, with the whole surface
// as the action. `busy` swaps the icon for a spinner, so a tap has feedback
// without adding any copy.
export default function InboxMetricCard({ icon: Icon, value, label, onClick, busy = false, highlight = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`tt-card h-full p-3 flex flex-col gap-1.5 text-left transition active:scale-[0.98] disabled:opacity-80 ${
        highlight ? 'border-terra/40' : ''
      }`}
    >
      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin text-terra-coral" />
      ) : (
        <Icon className={`w-4 h-4 ${highlight ? 'text-terra-coral' : 'text-ink-deep/45'}`} />
      )}
      <span className="font-display text-xl font-bold leading-none text-ink-deep tabular-nums">{value}</span>
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] leading-tight text-ink-deep/55">
        {label}
      </span>
    </button>
  );
}