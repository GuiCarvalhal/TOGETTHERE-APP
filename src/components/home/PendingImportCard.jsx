import React from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImportClassificationNote from '@/components/tt/ImportClassificationNote';
import { useI18n } from '@/lib/i18n';

// One pending reservation import: file it into an existing gathering, or start a
// new one without leaving the flow. The gathering list is the user's LIVE list
// (refreshed when the menu opens and after a gathering is created), so a
// gathering created after the mailbox sync is always selectable.
export default function PendingImportCard({
  item,
  gatherings,
  selectedId,
  onSelect,
  onRefresh,
  onCreateNew,
  onConfirm,
  onDiscard,
  busy,
}) {
  const { t } = useI18n();

  const title = item?.extracted_draft?.title || item.source_subject || t('home.importFallbackTitle');
  const subtitle = [item?.extracted_draft?.start_datetime, item?.source_sender].filter(Boolean).join(' · ');

  // Suggested (auto-detected) first, then the other ingestion candidates, then
  // every remaining gathering — nothing is ever hidden from the list.
  const suggested = item.suggested_gathering_id || '';
  const candidateIds = Array.isArray(item.candidate_gathering_ids) ? item.candidate_gathering_ids : [];
  const ordered = [
    ...gatherings.filter((g) => g.id === suggested),
    ...gatherings.filter((g) => g.id !== suggested && candidateIds.includes(g.id)),
    ...gatherings.filter((g) => g.id !== suggested && !candidateIds.includes(g.id)),
  ];

  return (
    <div className="rounded-xl border border-ink-charcoal/15 bg-cream-pale p-3.5 space-y-3">
      <div>
        <p className="text-sm font-semibold text-ink-deep">{title}</p>
        {subtitle && <p className="text-xs text-ink-deep/60 mt-0.5">{subtitle}</p>}
        <ImportClassificationNote item={item} />
      </div>

      {ordered.length === 0 ? (
        <p className="text-xs text-ink-deep/60">{t('home.importNoGatherings')}</p>
      ) : (
        <Select
          value={selectedId}
          onValueChange={onSelect}
          onOpenChange={(open) => { if (open) onRefresh?.(); }}
        >
          <SelectTrigger
            aria-label={t('home.selectGathering')}
            className="bg-card border-ink-charcoal/20 text-ink-deep h-10"
          >
            <SelectValue placeholder={t('home.selectGathering')} />
          </SelectTrigger>
          <SelectContent>
            {ordered.map((g) => (
              <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={onCreateNew}
        className="w-full justify-center"
      >
        <Plus className="w-3.5 h-3.5" />
        {t('home.importCreateGathering')}
      </Button>

      <div className="grid sm:grid-cols-[1fr_auto] gap-2.5">
        <Button size="sm" disabled={busy || !selectedId} onClick={onConfirm}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t('home.importCreate')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDiscard}>
          <X className="w-3.5 h-3.5" />
          {t('home.importDismiss')}
        </Button>
      </div>
    </div>
  );
}