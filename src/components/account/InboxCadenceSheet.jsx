import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';

// Sync cadence for ONE mailbox. The allowed values come from the server
// (getInboxConnections.sync_intervals) so the UI can never offer a cadence the
// backend would reject.
export default function InboxCadenceSheet({ open, connection, intervals, onOpenChange, onSaved }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !connection) return;
    setSelected(connection.sync_interval_minutes || 30);
    setError('');
    setBusy(false);
  }, [open, connection]);

  const options = Array.isArray(intervals) && intervals.length ? intervals : [5, 15, 30, 60];

  const save = async () => {
    if (!connection) return;
    setBusy(true);
    setError('');
    try {
      await base44.functions.invoke('updateInboxConnection', {
        connection_id: connection.id,
        sync_interval_minutes: selected,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err?.response?.data?.error || t('account.inboxCadenceFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title={t('account.inboxCadenceTitle')}>
      <div className="space-y-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-deep truncate">
            {connection?.display_label || connection?.provider_account_email || ''}
          </p>
          <p className="text-xs text-ink-deep/55 mt-0.5">{t('account.inboxCadenceDesc')}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {options.map((minutes) => {
            const active = selected === minutes;
            return (
              <button
                key={minutes}
                type="button"
                onClick={() => setSelected(minutes)}
                disabled={busy}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${
                  active
                    ? 'bg-terra/10 border-terra/30 text-terra-deep'
                    : 'border-ink-charcoal/15 text-ink-deep/60 hover:bg-foreground/5'
                }`}
              >
                {t('account.inboxCadenceEvery', { count: minutes })}
                {active ? <Check className="w-4 h-4" /> : null}
              </button>
            );
          })}
        </div>

        {error ? <p className="text-xs text-destructive break-words">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button onClick={save} disabled={busy || selected === (connection?.sync_interval_minutes || 30)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </FormSheet>
  );
}