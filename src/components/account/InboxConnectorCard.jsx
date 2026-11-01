import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

const STATUS_TONE = {
  connected: 'text-terra-deep border-terra/30 bg-terra/10',
  attention: 'text-destructive border-destructive/30 bg-destructive/10',
  disconnected: 'text-ink-deep/50 border-ink-charcoal/20 bg-foreground/5',
};

const STATUS_ICON = { connected: CheckCircle2, attention: AlertTriangle, disconnected: null };

// One mailbox card: state, account, last sync, last error and the three
// actions (Connect / Sync now / Disconnect).
export default function InboxConnectorCard({ label, connection, configured, busy, onConnect, onSync, onDisconnect }) {
  const { t, fmt } = useI18n();
  const status = connection?.status || 'disconnected';
  const statusLabel = status === 'connected'
    ? t('account.inboxStatusConnected')
    : status === 'attention'
      ? t('account.inboxStatusAttention')
      : t('account.inboxStatusDisconnected');
  const StatusIcon = STATUS_ICON[status];
  const isBusy = Boolean(busy);

  return (
    <div className="rounded-2xl border border-ink-charcoal/15 bg-foreground/5 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-deep">{label}</p>
          {connection?.provider_account_email ? (
            <p className="text-xs text-ink-deep/55 truncate">{connection.provider_account_email}</p>
          ) : null}
        </div>
        <span className={`tt-stamp shrink-0 ${STATUS_TONE[status]}`}>
          {StatusIcon ? <StatusIcon className="w-3 h-3" /> : null}
          {statusLabel}
        </span>
      </div>

      {connection?.last_sync_at ? (
        <p className="text-xs text-ink-deep/50">
          {t('account.inboxLastSync')}: {fmt.timeAgo(connection.last_sync_at)}
        </p>
      ) : status !== 'disconnected' ? (
        <p className="text-xs text-ink-deep/50">{t('account.inboxNever')}</p>
      ) : null}

      {connection?.last_error ? (
        <p className="text-xs text-destructive/90 break-words">{connection.last_error}</p>
      ) : null}

      {!configured ? (
        <p className="text-xs text-ink-deep/50">{t('account.inboxNotConfigured')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {status === 'disconnected' ? (
            <Button size="sm" onClick={onConnect} disabled={isBusy}>
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {t('account.inboxConnect')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={onSync} disabled={isBusy}>
                {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {t('account.inboxSyncNow')}
              </Button>
              <Button size="sm" variant="ghost" onClick={onConnect} disabled={isBusy}>
                {t('account.inboxReconnect')}
              </Button>
              <Button size="sm" variant="destructive" onClick={onDisconnect} disabled={isBusy}>
                <Unlink className="w-3.5 h-3.5" />
                {t('account.inboxDisconnect')}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}