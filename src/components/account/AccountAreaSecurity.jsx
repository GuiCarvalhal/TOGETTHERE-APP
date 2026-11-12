import React from 'react';
import { ShieldCheck } from 'lucide-react';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import AccountSecuritySection from '@/components/account/AccountSecuritySection';
import AccountAreaBar from '@/components/account/AccountAreaBar';

// Security & privacy area: the area bar (orange Back), then the existing
// controls. Signing out now lives on the Account hub, not here.
export default function AccountAreaSecurity() {
  return (
    <>
      <AccountAreaBar />
      <AccountAreaHeader
        Icon={ShieldCheck}
        titleKey="account.menuSecurity"
        descKey="account.secSecurityDesc"
      />
      <AccountSecuritySection />
    </>
  );
}