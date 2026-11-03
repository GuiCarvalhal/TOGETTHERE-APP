import React, { useState } from 'react';
import { Loader2, FolderPlus } from 'lucide-react';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';

// Pick the gathering an inbox segment belongs to. Filing is what actually creates
// the journey item (through the canonical create), so the transaction only
// happens after this confirmation.
export default function FileInboxItemSheet({ open, onOpenChange, item, gatherings, onConfirm, busy }) {
  const { t } = useI18n();
  const [gatheringId, setGatheringId] = useState('');

  React.useEffect(() => {
    if (open) setGatheringId('');
  }, [open, item?.id]);

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('inbox.chooseGathering')}>
      <div className="space-y-4">
        <p className="text-sm text-ink-deep/60">{t('inbox.chooseGatheringHint')}</p>

        {gatherings.length === 0 ? (
          <p className="text-sm text-ink-deep/60">{t('inbox.noGatherings')}</p>
        ) : (
          <Select value={gatheringId} onValueChange={setGatheringId}>
            <SelectTrigger className="bg-cream-pale border-ink-charcoal/20 text-ink-deep h-11">
              <SelectValue placeholder={t('home.selectGathering')} />
            </SelectTrigger>
            <SelectContent>
              {gatherings.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          className="w-full"
          disabled={busy || !gatheringId}
          onClick={() => onConfirm(gatheringId)}
        >
          {busy ? <Loader2 className="animate-spin" /> : <FolderPlus />}
          {t('inbox.addToGathering')}
        </Button>
      </div>
    </FormSheet>
  );
}