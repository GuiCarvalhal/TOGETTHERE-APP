import React from 'react';
import { Bell, Smartphone } from 'lucide-react';
import SettingsRow from '@/components/tt/SettingsRow';
import AccountPreferences from '@/components/account/AccountPreferences';
import { useI18n } from '@/lib/i18n';

// System preferences area: appearance, language, notification permissions and
// this device — exactly the controls the account page used to stack under this
// heading, now on their own page.
export default function AccountAreaPreferences() {
  const { t } = useI18n();

  return (
    <div className="space-y-3">
      <AccountPreferences />
      <div className="tt-card p-1.5 sm:p-2">
        <SettingsRow
          icon={Smartphone}
          label={t('account.installApp')}
          hint={t('home.installBannerBody')}
          to="/add-to-home-screen"
        />
        <div className="border-t border-ink-charcoal/10" />
        <SettingsRow icon={Bell} label={t('account.notifications')} hint={t('account.notificationsDesc')} />
      </div>
    </div>
  );
}