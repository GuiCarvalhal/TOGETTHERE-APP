import React from 'react';
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import { Button } from '@/components/ui/button';

// Journey item detail action strip — reuses StickyBar so it shares the exact
// sticky offset, background and border of the Journey page's filter bar.
// All actions are always visible (no overflow menu, no wrap, no scroll) using
// the canonical button system:
//  - Back: icon-only arrow, primary (terra) filled chip, 40x40, aria-labeled.
//  - Edit: Pencil + "Edit" label, secondary (neutral filled).
//  - Delete: icon-only trash, destructive (solid red) — compact sticky bar
//    exception. Keeps its confirmation dialog (caller's onDelete).
export default function DetailActionBar({ onBack, canEdit, canDelete, onEdit, onDelete, deleting, actions, backDisabled }) {
  const showActions = actions || canEdit || canDelete;
  return (
    <StickyBar>
      <Button variant="default" size="icon" onClick={onBack} disabled={backDisabled} aria-label="Back to journey" className="shrink-0">
        <ArrowLeft />
      </Button>

      {showActions && (
        <div className="ml-auto flex items-center gap-2">
          {actions || (
            <>
              {canEdit && (
                <Button variant="secondary" size="sm" onClick={onEdit} className="shrink-0">
                  <Pencil /> Edit
                </Button>
              )}
              {canDelete && (
                <Button variant="destructive" size="icon" onClick={onDelete} disabled={deleting} aria-label="Delete" className="shrink-0">
                  {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </StickyBar>
  );
}