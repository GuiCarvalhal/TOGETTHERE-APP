import React from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import SettingsRow from '@/components/tt/SettingsRow';
import { KeyRound, ShieldCheck, LogOut } from 'lucide-react';

// Security & privacy section of the Account page. Only existing capabilities:
// the platform's two-factor authentication page, the public privacy policy, and
// the SDK sign-out. Nothing here changes authentication behavior.
export default function AccountSecuritySection() {
  const { t } = useI18n();
  const { logout } = useAuth();

  return (
    <div className="tt-card p-1.5 sm:p-2">
      <SettingsRow icon={KeyRound} label={t('account.twoFactor')} hint={t('account.twoFactorDesc')} to="/mfa" />
      <div className="border-t border-ink-charcoal/10" />
      <SettingsRow
        icon={ShieldCheck}
        label={t('account.privacyPolicy')}
        hint={t('account.privacyPolicyDesc')}
        to="/privacy-policy"
      />
      <div className="border-t border-ink-charcoal/10" />
      <SettingsRow
        icon={LogOut}
        tone="destructive"
        label={t('account.signOut')}
        hint={t('account.signOutDesc')}
        onClick={() => logout()}
      />
    </div>
  );
}