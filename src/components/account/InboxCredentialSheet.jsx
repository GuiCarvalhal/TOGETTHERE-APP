import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useI18n } from '@/lib/i18n';
import FormSheet from '@/components/tt/FormSheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

const ERROR_KEYS = {
  invalid_email: 'account.inboxErrorInvalidEmail',
  missing_password: 'account.inboxErrorMissingPassword',
  invalid_password: 'account.inboxErrorInvalidPassword',
  auth_failed: 'account.inboxErrorAuthFailed',
  timeout: 'account.inboxErrorTimeout',
  denied: 'account.inboxErrorDenied',
  not_configured: 'account.inboxNotConfigured',
  credentials_key_missing: 'account.inboxErrorKeyMissing',
  credentials_key_invalid: 'account.inboxErrorKeyInvalid',
  use_oauth: 'account.inboxErrorUseOAuth',
  invalid_provider: 'account.inboxErrorImapFailed',
  imap_error: 'account.inboxErrorImapFailed',
  connect_failed: 'account.inboxErrorImapFailed',
};

// Connect form for iCloud — the only app-password provider (Yahoo connects with
// OAuth). The server verifies the password against the real IMAP server before
// anything is stored, then keeps it AES-GCM encrypted with an identified key.
export default function InboxCredentialSheet({ open, provider, label, onOpenChange, onConnected }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setAppPassword('');
    setError('');
    setBusy(false);
  }, [open]);

  const helpKey = 'account.inboxIcloudHelp';

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await base44.functions.invoke('connectImapInbox', { provider, email, appPassword });
      if (res.data?.ok) {
        onConnected?.();
        onOpenChange(false);
      } else {
        setError(t(ERROR_KEYS[res.data?.error] || 'account.inboxErrorImapFailed'));
      }
    } catch (err) {
      const code = err?.response?.data?.error;
      setError(t(ERROR_KEYS[code] || 'account.inboxErrorImapFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('account.inboxConnectTitle', { provider: label })}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-ink-deep/60 leading-relaxed">{t(helpKey)}</p>
        <p className="text-[0.6875rem] text-ink-deep/45 leading-relaxed rounded-xl bg-foreground/5 border border-ink-charcoal/10 px-3 py-2">
          {t('account.inboxIcloudSecurityHint')}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="inbox-imap-email">{t('account.inboxImapEmailLabel')}</Label>
          <Input
            id="inbox-imap-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={busy}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="inbox-imap-password">{t('account.inboxImapPasswordLabel')}</Label>
          <Input
            id="inbox-imap-password"
            type="password"
            autoComplete="off"
            value={appPassword}
            onChange={(event) => setAppPassword(event.target.value)}
            placeholder="xxxx-xxxx-xxxx-xxxx"
            disabled={busy}
            required
          />
          <p className="text-[0.6875rem] text-ink-deep/45">{t('account.inboxImapPasswordHint')}</p>
        </div>

        {error ? <p className="text-xs text-destructive break-words">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" disabled={busy || !email.trim() || !appPassword}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            {t('account.inboxImapConnectAction')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </FormSheet>
  );
}