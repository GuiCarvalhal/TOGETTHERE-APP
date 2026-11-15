import React, { useMemo, useState } from 'react';
import { BookMarked } from 'lucide-react';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import AreaTabPills from '@/components/account/AreaTabPills';
import PassportAwardsOverview from '@/components/account/PassportAwardsOverview';
import PassportArea from '@/components/passport/PassportArea';
import CommunityArea from '@/components/community/CommunityArea';
import { useI18n } from '@/lib/i18n';

// Passport & Awards — ONE account area for the user's travel record and the
// badges earned along the way. The four sections share the sticky bar with Back,
// so moving between them never costs a trip back to the hub, and the bucket list
// lives inside the same area instead of being its own menu entry.
export default function AccountAreaPassportAwards() {
  const { t } = useI18n();
  const [section, setSection] = useState('overview');

  const items = useMemo(() => ([
    { key: 'overview', label: t('passportAwards.tabOverview') },
    { key: 'passport', label: t('passportAwards.tabPassport') },
    { key: 'awards', label: t('passportAwards.tabAwards') },
    { key: 'bucket', label: t('passportAwards.tabBucket') },
  ]), [t]);

  return (
    <>
      <AccountAreaBar>
        <AreaTabPills items={items} value={section} onChange={setSection} />
      </AccountAreaBar>
      <AccountAreaHeader
        Icon={BookMarked}
        titleKey="account.menuPassportAwards"
        descKey="account.secPassportAwardsDesc"
      />

      {section === 'overview' ? <PassportAwardsOverview onGo={setSection} /> : null}
      {section === 'passport' ? <PassportArea section="visited" /> : null}
      {section === 'awards' ? <CommunityArea /> : null}
      {section === 'bucket' ? <PassportArea section="bucket" /> : null}
    </>
  );
}