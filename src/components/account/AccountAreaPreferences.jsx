import React from 'react';
import { Smartphone, SlidersHorizontal } from 'lucide-react';
import SettingsRow from '@/components/tt/SettingsRow';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import AccountPreferences from '@/components/account/AccountPreferences';
import AccountNotifications from '@/components/account/AccountNotifications';
import { useI18n } from '@/lib/i18n';

// System preferences area: the standard area bar, then appearance, language,
// notification controls (device + categories) and this-device install.
export default function AccountAreaPreferences() {
  const { t } = useI18n();

  return (
    <>
      <AccountAreaBar />
      <AccountAreaHeader
        Icon={SlidersHorizontal}
        titleKey="account.menuPreferences"
        descKey="account.secPreferencesDesc"
      />
      <div className="space-y-3">
        <AccountPreferences />
        <AccountNotifications />
        <div className="tt-card p-1.5 sm:p-2">
          <SettingsRow
            icon={Smartphone}
            label={t('account.installApp')}
            hint={t('home.installBannerBody')}
            to="/add-to-home-screen"
          />
        </div>
      </div>
    </>
  );
}