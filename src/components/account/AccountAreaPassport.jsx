import React from 'react';
import { BookMarked } from 'lucide-react';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import PassportArea from '@/components/passport/PassportArea';

// Passport area — its own page in the account flow, next to Community & Awards
// but separate from it: the passport is the user's own travel record.
export default function AccountAreaPassport() {
  return (
    <>
      <AccountAreaBar />
      <AccountAreaHeader
        Icon={BookMarked}
        titleKey="account.menuPassport"
        descKey="account.secPassportDesc"
      />
      <PassportArea />
    </>
  );
}