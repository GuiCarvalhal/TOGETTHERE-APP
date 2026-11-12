import React from 'react';
import { Inbox as InboxIcon, Landmark, Plug } from 'lucide-react';
import SettingsRow from '@/components/tt/SettingsRow';
import InboxConnectors from '@/components/account/InboxConnectors';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import { useI18n } from '@/lib/i18n';

// Connected integrations area: mailboxes that feed the Inbox (compact sync
// controls), an explicit note that bank connections are not available yet, and
// the Inbox shortcut.
export default function AccountAreaIntegrations() {
  const { t } = useI18n();

  return (
    <>
      <AccountAreaBar />
      <AccountAreaHeader
        Icon={Plug}
        titleKey="account.menuIntegrations"
        descKey="account.secIntegrationsDesc"
      />
      <div className="space-y-3">
        <div className="tt-card p-3 sm:p-4">
          <InboxConnectors />
        </div>

        <div className="tt-card flex items-start gap-3 p-3.5">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-foreground/5 text-ink-deep/45 shrink-0">
            <Landmark className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink-deep">{t('account.banksTitle')}</p>
            <p className="text-xs text-ink-deep/55 leading-relaxed mt-0.5">{t('account.banksBody')}</p>
          </div>
        </div>

        <div className="tt-card p-1.5 sm:p-2">
          <SettingsRow
            icon={InboxIcon}
            label={t('inbox.title')}
            hint={t('account.inboxRowDesc')}
            to="/inbox"
          />
        </div>
      </div>
    </>
  );
}