import React from 'react';
import { ArrowLeft, Trash2, Loader2 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';

// Journey item detail action strip — reuses StickyBar so it shares the exact
// sticky offset, background and border of the Journey page's filter bar.
// All actions are always visible (no overflow menu, no wrap, no scroll):
//  - Back: icon-only arrow, filled chip (same solid treatment as the Journey
//    page's primary chips), 40x40 tap target, aria-label for screen readers.
//  - Edit: text button that literally says "Edit" (no icon).
//  - Delete: icon-only trash, destructive styling, keeps its confirmation dialog
//    (triggered by the caller's onDelete). Only rendered when permitted.
export default function DetailActionBar({ onBack, canEdit, canDelete, onEdit, onDelete, deleting }) {
  const showActions = canEdit || canDelete;
  return (
    <StickyBar>
      <button
        onClick={onBack}
        aria-label="Back to journey"
        className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-terra text-cream hover:bg-terra-deep transition-colors shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {showActions && (
        <div className="ml-auto flex items-center gap-2">
          {canEdit && (
            <button
              onClick={onEdit}
              className="inline-flex items-center h-9 px-3.5 rounded-full text-xs font-semibold border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors shrink-0"
            >
              Edit
            </button>
          )}
          {canDelete && (
            <button
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete"
              className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60 shrink-0"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
          )}
        </div>
      )}
    </StickyBar>
  );
}