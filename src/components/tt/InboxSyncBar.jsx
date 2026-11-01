import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Inbox, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

// Home entry point for mailbox sync: one tap syncs every eligible mailbox
// (cadence is bypassed for an explicit tap) and reports a compact result. It
// renders nothing until the user has connected at least one mailbox.
export default function InboxSyncBar({ connections = [], onSynced }) {
  const { t, fmt } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const active = connections.filter((c) => c.status !== 'disconnected');
  if (!active.length) return null;

  const lastSyncAt = active
    .map((c) => c.last_sync_at)
    .filter(Boolean)
    .sort()
    .pop() || '';

  const syncNow = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('syncInboxConnections', { force: true });
      const s = res.data?.summary || {};
      setResult({
        synced: s.synced || 0,
        imported: s.imported || 0,
        failed: s.failed || 0,
      });
      await onSynced?.();
    } catch {
      setResult({ error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tt-card p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Inbox className="w-4 h-4 text-terra-coral shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-deep">{t('home.inboxSyncTitle')}</p>
            <p className="text-xs text-ink-deep/60">
              {t('home.inboxSyncSummary', { count: active.length })}
              {lastSyncAt ? ` · ${t('home.inboxSyncLast', { time: fmt.timeAgo(lastSyncAt) })}` : ''}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={syncNow} disabled={busy} className="shrink-0">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {busy ? t('home.inboxSyncing') : t('home.inboxSyncAction')}
        </Button>
      </div>

      {result?.error ? (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <AlertTriangle className="w-3.5 h-3.5" />
          {t('home.inboxSyncFailed')}
        </p>
      ) : result ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-deep/65">
          <CheckCircle2 className={`w-3.5 h-3.5 ${result.failed ? 'text-destructive' : 'text-terra-deep'}`} />
          <span>{t('home.inboxSynced', { count: result.synced })}</span>
          <span className="text-ink-deep/30">·</span>
          <span>{t('home.inboxSyncImported', { count: result.imported })}</span>
          {result.failed ? (
            <>
              <span className="text-ink-deep/30">·</span>
              <span className="text-destructive">{t('home.inboxSyncFailedCount', { count: result.failed })}</span>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}