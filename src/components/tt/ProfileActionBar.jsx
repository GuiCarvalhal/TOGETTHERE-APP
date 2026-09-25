import React from 'react';
import { ArrowLeft, Pencil, Check, X, Loader2 } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';

// Profile page action strip — reuses StickyBar so it shares the exact sticky
// offset, background and border of the Journey filter bar and the item-detail
// DetailActionBar (single source of truth — no visual drift).
//
// "Back" is always visible (leftmost, with a readable label). Only the profile
// owner sees Edit/Save/Cancel: in view mode a single Edit button; in edit mode
// Cancel + Save (Save is a no-op when nothing changed or while saving). Viewing
// someone else's profile shows Back only — no permission is loosened.
export default function ProfileActionBar({ onBack, isOwner, editing, onEdit, onSave, onCancel, canSave, saving }) {
  return (
    <StickyBar>
      <button
        onClick={onBack}
        aria-label="Back"
        className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-terra text-cream hover:bg-terra-deep transition-colors shrink-0"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {isOwner && (
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <button
                onClick={onCancel}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-60"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={onSave}
                disabled={!canSave || saving}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold bg-terra text-cream hover:bg-terra-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
              </button>
            </>
          ) : (
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border border-foreground/15 text-foreground hover:bg-foreground/5 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      )}
    </StickyBar>
  );
}