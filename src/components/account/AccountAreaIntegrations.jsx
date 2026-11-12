import React from 'react';
import { Inbox as InboxIcon } from 'lucide-react';
import SettingsRow from '@/components/tt/SettingsRow';
import InboxConnectors from '@/components/account/InboxConnectors';
import { useI18n } from '@/lib/i18n';

// Connected integrations area: the mailboxes that feed the Inbox, plus the
// shortcut into it. Banking lives in the Inbox itself (Expenses stream), so it
// is deliberately not listed here.
export default function AccountAreaIntegrations() {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <div className="tt-card p-4 sm:p-5">
        <InboxConnectors />
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
  );
}