import React from 'react';
import { ArrowLeft, Pencil, Trash2, MoreHorizontal, Loader2 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// Journey item detail action strip — reuses StickyBar so it shares the exact
// sticky offset, background and border of the Journey page's filter bar.
// "Back to Journey" is always visible (leftmost, with a readable label).
// Edit/Delete keep their current permission gating (only rendered when the
// caller passes canEdit/canDelete). On narrow widths the two actions collapse
// into an overflow (3-dot) menu so the row never wraps or scrolls; on sm+ they
// sit inline. Delete keeps destructive styling and its existing confirmation.
export default function DetailActionBar({ onBack, canEdit, canDelete, onEdit, onDelete, deleting }) {
  const showActions = canEdit || canDelete;
  return (
    <StickyBar>
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold text-foreground hover:bg-foreground/5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Journey</span>
      </button>

      {showActions && (
        <div className="ml-auto flex items-center gap-2">
          {/* Inline Edit/Delete on wider widths */}
          <div className="hidden sm:flex items-center gap-2">
            {canEdit && (
              <button
                onClick={onEdit}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {canDelete && (
              <button
                onClick={onDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} Delete
              </button>
            )}
          </div>

          {/* Overflow menu on phone widths — keeps the row on a single line */}
          <div className="sm:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="inline-flex items-center justify-center h-9 w-9 rounded-full border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors"
                  aria-label="More actions"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1.5 bg-card text-card-foreground">
                {canEdit && (
                  <button
                    onClick={onEdit}
                    className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-foreground/5"
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    onClick={onDelete}
                    disabled={deleting}
                    className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}
    </StickyBar>
  );
}