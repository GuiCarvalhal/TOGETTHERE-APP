import React from 'react';
import { useI18n } from '@/lib/i18n';
import SettingsRow from '@/components/tt/SettingsRow';
import { KeyRound, ShieldCheck } from 'lucide-react';

// Security & privacy section of the Account page. Only existing capabilities:
// the platform's two-factor authentication page and the public privacy policy.
// Signing out is a single primary action on the Account hub, not a row here.
export default function AccountSecuritySection() {
  const { t } = useI18n();

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
    </div>
  );
}