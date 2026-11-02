import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import FormSheet from '@/components/tt/FormSheet';
import { useI18n } from '@/lib/i18n';
import { Loader2, Plus } from 'lucide-react';

// Minimal inline creation used from the reservation-import flow: a name is all
// that is needed to file an imported segment. Cover, links and destinations stay
// on the dedicated New gathering page.
export default function NewGatheringSheet({ open, onOpenChange, onCreated }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError(t('newGathering.nameRequired')); return; }
    setSaving(true);
    setError('');
    try {
      const res = await base44.functions.invoke('createGathering', { name: trimmed });
      const data = res.data || res;
      const gathering = data?.gathering;
      if (!gathering?.id) throw new Error(t('newGathering.couldNotCreate'));
      setName('');
      onCreated?.(gathering);
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('newGathering.couldNotCreate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('home.newGatheringTitle')} maxWidth="max-w-md">
      <form onSubmit={submit} className="space-y-4 pb-2">
        <p className="text-sm text-ink-deep/60">{t('home.newGatheringHint')}</p>
        <div className="space-y-1.5">
          <Label htmlFor="import-new-gathering-name" className="text-ink-deep">{t('newGathering.name')}</Label>
          <Input
            id="import-new-gathering-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('newGathering.namePlaceholder')}
            autoFocus
            required
            className="bg-cream-pale border-ink-charcoal/20 text-ink-deep"
          />
        </div>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            {t('newGathering.create')}
          </Button>
        </div>
      </form>
    </FormSheet>
  );
}