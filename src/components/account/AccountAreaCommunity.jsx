import React from 'react';
import { Trophy } from 'lucide-react';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import CommunityArea from '@/components/community/CommunityArea';

// Community & Awards area — motivational badge shelf, on its own page like every
// other area so the hub stays a single clear choice.
export default function AccountAreaCommunity() {
  return (
    <>
      <AccountAreaBar />
      <AccountAreaHeader
        Icon={Trophy}
        titleKey="account.menuCommunity"
        descKey="account.secCommunityDesc"
      />
      <CommunityArea />
    </>
  );
}