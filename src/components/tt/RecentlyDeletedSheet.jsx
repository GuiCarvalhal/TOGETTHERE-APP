import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { SOFT_DELETE_RETENTION_DAYS, daysLeftToRestore } from '@/lib/softDelete';

// "Recently deleted" recovery panel, shared by Journey and Expenses. Each item
// carries only what the page chooses to show: { id, title, meta, deletedAt }.
function formatWhen(iso) {
  const ts = Date.parse(iso || '');
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RecentlyDeletedSheet({ open, onClose, title, items = [], loading, onRestore, restoringId, emptyLabel }) {
  const { t } = useI18n();
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-card text-card-foreground max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{title || t('recentlyDeleted.title')}</DialogTitle>
          <DialogDescription>{t('recentlyDeleted.retention', { days: SOFT_DELETE_RETENTION_DAYS })}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
          {loading ? (
            <div className="py-8 grid place-items-center">
              <Loader2 className="w-5 h-5 animate-spin text-terra-deep" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-deep/50">{emptyLabel || t('recentlyDeleted.empty')}</p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="tt-card p-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-ink-deep truncate">{it.title}</p>
                  {it.meta && <p className="text-xs text-ink-deep/55 truncate mt-0.5">{it.meta}</p>}
                  <p className="text-[0.6875rem] text-ink-deep/40 mt-0.5">
                    {t('recentlyDeleted.deletedOn', { when: formatWhen(it.deletedAt) })}
                    {' · '}
                    {t('recentlyDeleted.daysLeft', { count: daysLeftToRestore(it.deletedAt), days: daysLeftToRestore(it.deletedAt) })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRestore(it)}
                  disabled={restoringId === it.id}
                  className="shrink-0"
                >
                  {restoringId === it.id ? <Loader2 className="animate-spin" /> : <Undo2 />}
                  <span className="hidden sm:inline">{t('recentlyDeleted.restore')}</span>
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}