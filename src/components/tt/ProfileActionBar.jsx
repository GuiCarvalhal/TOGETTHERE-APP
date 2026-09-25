import React from 'react';
import { ArrowLeft, Pencil, Check, X, Loader2 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import { Button } from '@/components/ui/button';

// Profile page action strip — reuses StickyBar so it shares the exact sticky
// offset, background and border of the Journey filter bar and the item-detail
// DetailActionBar. Canonical button system, all actions always visible:
//  - Back: icon-only arrow, primary (terra) filled, 40x40, aria-labeled.
//  - Owner view mode: Edit (Pencil + "Edit", secondary).
//  - Owner edit mode: Cancel (X + "Cancel", outline) + Save (Check + "Save",
//    primary; no-op when nothing changed / while saving).
// Other viewers see Back only — no permission is loosened.
export default function ProfileActionBar({ onBack, isOwner, editing, onEdit, onSave, onCancel, canSave, saving }) {
  return (
    <StickyBar>
      <Button variant="default" size="icon" onClick={onBack} aria-label="Back" className="shrink-0">
        <ArrowLeft />
      </Button>

      {isOwner && (
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="shrink-0">
                <X /> Cancel
              </Button>
              <Button variant="default" size="sm" onClick={onSave} disabled={!canSave || saving} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onEdit} className="shrink-0">
              <Pencil /> Edit
            </Button>
          )}
        </div>
      )}
    </StickyBar>
  );
}