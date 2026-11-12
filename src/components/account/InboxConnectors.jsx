import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import InboxConnectorCard from './InboxConnectorCard';
import InboxCredentialSheet from './InboxCredentialSheet';
import InboxCadenceSheet from './InboxCadenceSheet';
import { DEFAULT_INBOX_INTERVALS, INBOX_PROVIDERS } from './inboxProviders';

// Mailbox sync controls for the integrations area — deliberately dense: one
// grouped list per provider, one row per mailbox (status dot, address,
// cadence · last sync, icon actions), and the same connect/sync/cadence/
// disconnect behavior as before. Each provider can hold several mailboxes.
export default function InboxConnectors() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [configured, setConfigured] = useState({});
  const [intervals, setIntervals] = useState(DEFAULT_INBOX_INTERVALS);
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [credentialProvider, setCredentialProvider] = useState('');
  const [cadenceConnection, setCadenceConnection] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getInboxConnections', {});
      const data = res.data || {};
      setConnections(data.connections || []);
      setConfigured(data.configured || {});
      if (Array.isArray(data.sync_intervals) && data.sync_intervals.length) {
        setIntervals(data.sync_intervals);
      }
      setError('');
    } catch {
      setError(t('account.inboxLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  // The OAuth callback redirects back here with ?inbox=connected|error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('inbox');
    if (!outcome) return;
    setNotice(outcome === 'connected' ? t('account.inboxConnectedNotice') : t('account.inboxErrorNotice'));
    params.delete('inbox');
    params.delete('provider');
    params.delete('reason');
    const search = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (search ? `?${search}` : ''));
  }, [t]);

  const handleConnect = async (provider, auth) => {
    setError('');
    setNotice('');
    // iCloud collects an app-specific password in a sheet instead of redirecting;
    // every other provider goes through the OAuth flow.
    if (auth === 'credential') {
      setCredentialProvider(provider);
      return;
    }
    setBusyKey(`connect:${provider}`);
    try {
      const res = await base44.functions.invoke('startInboxOAuth', { provider });
      const url = res.data?.url;
      if (!url) throw new Error('missing url');
      window.location.href = url;
    } catch {
      setError(t('account.inboxConnectFailed'));
      setBusyKey('');
    }
  };

  const handleSync = async (connection) => {
    setBusyKey(connection.id);
    setError('');
    setNotice('');
    try {
      const res = await base44.functions.invoke('syncInboxConnections', {
        connection_id: connection.id,
        force: true,
      });
      const result = (res.data?.results || [])[0];
      if (result?.ok === false) setError(result.error || t('account.inboxSyncFailed'));
      else if (result?.reason === 'in_flight') setError(t('account.inboxInFlight'));
      else setNotice(t('account.inboxSyncDone', { count: result?.ingested ?? 0 }));
      await load();
    } catch {
      setError(t('account.inboxSyncFailed'));
    } finally {
      setBusyKey('');
    }
  };

  const handleDisconnect = async (connection) => {
    setBusyKey(connection.id);
    setError('');
    setNotice('');
    try {
      await base44.functions.invoke('disconnectInboxConnection', { connection_id: connection.id });
      setNotice(t('account.inboxDisconnected'));
      await load();
    } catch {
      setError(t('account.inboxDisconnectFailed'));
    } finally {
      setBusyKey('');
    }
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="space-y-2">
          <div className="tt-skeleton h-9 w-full" />
          <div className="tt-skeleton h-9 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {INBOX_PROVIDERS.map(({ provider, labelKey, auth, hintKey }) => {
            const rows = connections.filter((c) => c.provider === provider);
            const isConfigured = configured[provider] !== false;
            return (
              <div key={provider}>
                <div className="flex items-center justify-between gap-2 px-1 pb-1">
                  <p className="tt-label text-ink-deep/45">{t(labelKey)}</p>
                  {rows.length > 0 && isConfigured ? (
                    <button
                      type="button"
                      onClick={() => handleConnect(provider, auth)}
                      className="text-[0.6875rem] font-semibold text-terra-deep hover:underline shrink-0"
                    >
                      {t('account.inboxAddAnother')}
                    </button>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-ink-charcoal/12 bg-foreground/[0.03] divide-y divide-ink-charcoal/10 overflow-hidden">
                  {rows.length === 0 ? (
                    <InboxConnectorCard
                      label={t(labelKey)}
                      hint={hintKey ? t(hintKey) : ''}
                      connection={null}
                      configured={isConfigured}
                      busy={busyKey === `connect:${provider}`}
                      onConnect={() => handleConnect(provider, auth)}
                    />
                  ) : (
                    rows.map((connection) => (
                      <InboxConnectorCard
                        key={connection.id}
                        label={t(labelKey)}
                        connection={connection}
                        configured={isConfigured}
                        busy={busyKey === connection.id}
                        onConnect={() => handleConnect(provider, auth)}
                        onSync={() => handleSync(connection)}
                        onDisconnect={() => handleDisconnect(connection)}
                        onEditCadence={() => setCadenceConnection(connection)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notice ? <p className="text-xs text-terra-deep">{notice}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <InboxCredentialSheet
        open={Boolean(credentialProvider)}
        provider={credentialProvider}
        label={t('account.inboxIcloud')}
        onOpenChange={(open) => { if (!open) setCredentialProvider(''); }}
        onConnected={() => {
          load();
          setNotice(t('account.inboxConnectedNotice'));
        }}
      />

      <InboxCadenceSheet
        open={Boolean(cadenceConnection)}
        connection={cadenceConnection}
        intervals={intervals}
        onOpenChange={(open) => { if (!open) setCadenceConnection(null); }}
        onSaved={() => {
          setNotice(t('account.inboxCadenceSaved'));
          load();
        }}
      />
    </div>
  );
}