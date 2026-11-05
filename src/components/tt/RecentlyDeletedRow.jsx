import React from 'react';
import { Undo2, ChevronRight } from 'lucide-react';

// Lightweight recovery entry point shown under the Journey / Expenses lists.
// Only rendered when something is actually recoverable, so it never adds noise
// to a clean page.
export default function RecentlyDeletedRow({ count, label, onClick }) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 w-full tt-ink-panel p-3 flex items-center gap-3 text-left transition-colors hover:bg-foreground/5"
    >
      <span className="w-9 h-9 rounded-lg bg-terra/10 border border-terra/20 grid place-items-center shrink-0">
        <Undo2 className="w-4 h-4 text-terra-deep" />
      </span>
      <span className="min-w-0 flex-1 font-display text-sm font-bold text-ink-deep leading-tight">{label}</span>
      <span className="shrink-0 text-xs font-semibold text-terra-deep bg-terra/10 border border-terra/20 rounded-full px-2 py-0.5">{count}</span>
      <ChevronRight className="w-4 h-4 text-ink-deep/35 shrink-0" />
    </button>
  );
}