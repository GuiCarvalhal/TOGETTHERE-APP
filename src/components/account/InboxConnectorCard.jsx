import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { AlertTriangle, CheckCircle2, Clock, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

const STATUS_TONE = {
  connected: 'text-terra-deep border-terra/30 bg-terra/10',
  attention: 'text-destructive border-destructive/30 bg-destructive/10',
  disconnected: 'text-ink-deep/50 border-ink-charcoal/20 bg-foreground/5',
};

const STATUS_ICON = { connected: CheckCircle2, attention: AlertTriangle, disconnected: null };

const STATUS_LABEL_KEY = {
  connected: 'account.inboxStatusConnected',
  attention: 'account.inboxStatusAttention',
  disconnected: 'account.inboxStatusDisconnected',
};

// One mailbox card: state, address, cadence, last sync, last error, and the
// per-account actions. With no connection it degrades to the provider's
// "Connect" affordance, so an empty provider group needs no extra component.
export default function InboxConnectorCard({
  label,
  hint,
  connection,
  configured,
  busy,
  onConnect,
  onSync,
  onDisconnect,
  onEditCadence,
}) {
  const { t, fmt } = useI18n();
  const status = connection?.status || 'disconnected';
  const StatusIcon = STATUS_ICON[status];
  const isBusy = Boolean(busy);
  const syncing = isBusy || Boolean(connection?.in_flight);

  if (!connection) {
    return (
      <div className="rounded-2xl border border-ink-charcoal/15 bg-foreground/5 p-3.5 space-y-2.5">
        <p className="text-sm font-semibold text-ink-deep">{label}</p>
        <p className="text-xs text-ink-deep/50">{t('account.inboxNoAccounts')}</p>
        {configured ? (
          <>
            <Button size="sm" onClick={onConnect} disabled={isBusy}>
              {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              {t('account.inboxConnect')}
            </Button>
            {hint ? <p className="text-[0.6875rem] text-ink-deep/45 leading-relaxed">{hint}</p> : null}
          </>
        ) : (
          <p className="text-xs text-ink-deep/50">{t('account.inboxNotConfigured')}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-ink-charcoal/15 bg-foreground/5 p-3.5 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-deep truncate">
            {connection.display_label || connection.provider_account_email || label}
          </p>
          {connection.provider_account_email
            && connection.display_label
            && connection.display_label !== connection.provider_account_email ? (
              <p className="text-xs text-ink-deep/55 truncate">{connection.provider_account_email}</p>
            ) : null}
        </div>
        <span className={`tt-stamp shrink-0 ${STATUS_TONE[status]}`}>
          {StatusIcon ? <StatusIcon className="w-3 h-3" /> : null}
          {t(STATUS_LABEL_KEY[status])}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-deep/50">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {t('account.inboxCadenceEvery', { count: connection.sync_interval_minutes || 30 })}
        </span>
        <span>
          {connection.last_sync_at
            ? `${t('account.inboxLastSync')}: ${fmt.timeAgo(connection.last_sync_at)}`
            : t('account.inboxNever')}
        </span>
      </div>

      {connection.last_error ? (
        <p className="text-xs text-destructive/90 break-words">{connection.last_error}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button size="sm" variant="secondary" onClick={onSync} disabled={syncing}>
          {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {syncing ? t('account.inboxSyncingNow') : t('account.inboxSyncNow')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEditCadence} disabled={isBusy}>
          {t('account.inboxEditCadence')}
        </Button>
        {status === 'attention' ? (
          <Button size="sm" variant="ghost" onClick={onConnect} disabled={isBusy}>
            {t('account.inboxReconnect')}
          </Button>
        ) : null}
        <Button size="sm" variant="destructive" onClick={onDisconnect} disabled={isBusy}>
          <Unlink className="w-3.5 h-3.5" />
          {t('account.inboxDisconnect')}
        </Button>
      </div>
    </div>
  );
}