import React from 'react';
import { useI18n } from '@/lib/i18n';
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
// Other viewers see Back only — no permission is loosened. Labels come from the
// shared dictionaries so the bar follows the app language.
export default function ProfileActionBar({ onBack, isOwner, editing, onEdit, onSave, onCancel, canSave, saving }) {
  const { t } = useI18n();
  return (
    <StickyBar>
      <Button variant="default" size="icon" onClick={onBack} aria-label={t('common.back')} className="shrink-0">
        <ArrowLeft />
      </Button>

      {isOwner && (
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} className="shrink-0">
                <X /> {t('common.cancel')}
              </Button>
              <Button variant="default" size="sm" onClick={onSave} disabled={!canSave || saving} className="shrink-0">
                {saving ? <Loader2 className="animate-spin" /> : <Check />} {t('common.save')}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onEdit} className="shrink-0">
              <Pencil /> {t('common.edit')}
            </Button>
          )}
        </div>
      )}
    </StickyBar>
  );
}