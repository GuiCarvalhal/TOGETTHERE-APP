import React from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { cadenceLabel } from './inboxProviders';
import { Clock, Link2, Loader2, RefreshCw, Unlink } from 'lucide-react';

// Status colours for the leading dot. Text labels live on the page level, so a
// mailbox row stays one dense line: dot, address, cadence · last sync, actions.
const DOT_TONE = {
  connected: 'bg-terra',
  attention: 'bg-destructive',
  disconnected: 'bg-ink-deep/25',
};

const ICON_BTN = 'h-8 w-8 p-0';

// One mailbox row — or, with no connection, the provider's compact Connect
// affordance. Actions are icon buttons with aria-labels to keep the row short.
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
  const isBusy = Boolean(busy);

  if (!connection) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 min-w-0" title={hint || undefined}>
        <span className="w-2 h-2 rounded-full bg-ink-deep/20 shrink-0" />
        <span className="text-xs text-ink-deep/45 truncate flex-1 min-w-0">
          {configured ? t('account.inboxNoAccounts') : t('account.inboxNotConfigured')}
        </span>
        {configured ? (
          <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={onConnect} disabled={isBusy}>
            {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
            {t('account.inboxConnect')}
          </Button>
        ) : null}
      </div>
    );
  }

  const status = connection.status || 'disconnected';
  const syncing = isBusy || Boolean(connection.in_flight);
  const address = connection.provider_account_email || connection.display_label || label;
  const lastSync = connection.last_sync_at
    ? `${t('account.inboxLastSync')}: ${fmt.timeAgo(connection.last_sync_at)}`
    : t('account.inboxNever');

  return (
    <div className="px-3 py-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${DOT_TONE[status] || DOT_TONE.disconnected}`} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-deep truncate">{address}</p>
          <p className="text-[0.6875rem] text-ink-deep/50 truncate">
            {cadenceLabel(connection.sync_interval_minutes, t)} · {lastSync}
          </p>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className={ICON_BTN}
            onClick={onSync}
            disabled={syncing}
            aria-label={syncing ? t('account.inboxSyncingNow') : t('account.inboxSyncNow')}
            title={syncing ? t('account.inboxSyncingNow') : t('account.inboxSyncNow')}
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={ICON_BTN}
            onClick={onEditCadence}
            disabled={isBusy}
            aria-label={t('account.inboxEditCadence')}
            title={t('account.inboxEditCadence')}
          >
            <Clock className="w-3.5 h-3.5" />
          </Button>
          {status === 'attention' ? (
            <Button
              size="sm"
              variant="ghost"
              className={ICON_BTN}
              onClick={onConnect}
              disabled={isBusy}
              aria-label={t('account.inboxReconnect')}
              title={t('account.inboxReconnect')}
            >
              <Link2 className="w-3.5 h-3.5" />
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className={`${ICON_BTN} text-destructive hover:bg-destructive/10`}
            onClick={onDisconnect}
            disabled={isBusy}
            aria-label={t('account.inboxDisconnect')}
            title={t('account.inboxDisconnect')}
          >
            <Unlink className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      {connection.last_error ? (
        <p className="text-[0.6875rem] text-destructive/90 break-words mt-1 pl-4">{connection.last_error}</p>
      ) : null}
    </div>
  );
}