import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import { Inbox } from 'lucide-react';
import InboxConnectorCard from './InboxConnectorCard';
import InboxCredentialSheet from './InboxCredentialSheet';

const PROVIDERS = [
  { provider: 'gmail', labelKey: 'account.inboxGmail', auth: 'oauth' },
  { provider: 'outlook', labelKey: 'account.inboxOutlook', auth: 'oauth' },
  { provider: 'icloud', labelKey: 'account.inboxIcloud', auth: 'credential' },
  { provider: 'yahoo', labelKey: 'account.inboxYahoo', auth: 'credential' },
];

// Inbox connectors section on the Account page: Gmail/Outlook.com (OAuth) and
// iCloud/Yahoo (IMAP app password) mailboxes that feed the reservation import
// pipeline. Connection state comes from getInboxConnections (credentials never
// leave the server).
export default function InboxConnectors() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState([]);
  const [configured, setConfigured] = useState({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [credentialProvider, setCredentialProvider] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke('getInboxConnections', {});
      const data = res.data || {};
      setConnections(data.connections || []);
      setConfigured(data.configured || {});
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

  const findConnection = (provider) => connections.find((c) => c.provider === provider) || null;

  const handleConnect = async (provider, auth) => {
    setError('');
    setNotice('');
    // iCloud/Yahoo collect an app password in a sheet instead of redirecting.
    if (auth === 'credential') {
      setCredentialProvider(provider);
      return;
    }
    setBusy(provider);
    try {
      const res = await base44.functions.invoke('startInboxOAuth', { provider });
      const url = res.data?.url;
      if (!url) throw new Error('missing url');
      window.location.href = url;
    } catch {
      setError(t('account.inboxConnectFailed'));
      setBusy('');
    }
  };

  const handleSync = async (provider) => {
    setBusy(provider);
    setError('');
    setNotice('');
    try {
      const res = await base44.functions.invoke('syncInboxConnections', { provider, force: true });
      const result = (res.data?.results || [])[0];
      if (result && result.ok === false) setError(result.error || t('account.inboxSyncFailed'));
      else setNotice(t('account.inboxSyncDone', { count: result?.ingested ?? 0 }));
      await load();
    } catch {
      setError(t('account.inboxSyncFailed'));
    } finally {
      setBusy('');
    }
  };

  const handleDisconnect = async (provider) => {
    setBusy(provider);
    setError('');
    setNotice('');
    try {
      await base44.functions.invoke('disconnectInboxConnection', { provider });
      setNotice(t('account.inboxDisconnected'));
      await load();
    } catch {
      setError(t('account.inboxDisconnectFailed'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Inbox className="w-4 h-4 text-terra-deep" />
        <p className="tt-label text-ink-deep/50">{t('account.inboxTitle')}</p>
      </div>
      <p className="text-xs text-ink-deep/55">{t('account.inboxDesc')}</p>

      {loading ? (
        <div className="space-y-2">
          <div className="tt-skeleton h-24 w-full" />
          <div className="tt-skeleton h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-2">
          {PROVIDERS.map(({ provider, labelKey, auth }) => (
            <InboxConnectorCard
              key={provider}
              label={t(labelKey)}
              connection={findConnection(provider)}
              configured={configured[provider] !== false}
              busy={busy === provider}
              onConnect={() => handleConnect(provider, auth)}
              onSync={() => handleSync(provider)}
              onDisconnect={() => handleDisconnect(provider)}
            />
          ))}
        </div>
      )}

      {notice ? <p className="text-xs text-terra-deep">{notice}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <InboxCredentialSheet
        open={Boolean(credentialProvider)}
        provider={credentialProvider}
        label={t(credentialProvider === 'yahoo' ? 'account.inboxYahoo' : 'account.inboxIcloud')}
        onOpenChange={(open) => { if (!open) setCredentialProvider(''); }}
        onConnected={() => {
          load();
          setNotice(t('account.inboxConnectedNotice'));
        }}
      />
    </div>
  );
}