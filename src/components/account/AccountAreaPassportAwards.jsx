import React, { useMemo, useState } from 'react';
import { BookMarked } from 'lucide-react';
import AccountAreaBar from '@/components/account/AccountAreaBar';
import AccountAreaHeader from '@/components/account/AccountAreaHeader';
import AreaTabPills from '@/components/account/AreaTabPills';
import PassportAwardsSummaryCard from '@/components/account/PassportAwardsSummaryCard';
import PassportArea from '@/components/passport/PassportArea';
import CommunityArea from '@/components/community/CommunityArea';
import { useI18n } from '@/lib/i18n';

// Passport & Awards — ONE account area for the user's travel record, the badges
// earned along the way and the places still on the wishlist. Three sections that
// share the sticky bar with Back, so moving between them never costs a trip back
// to the hub; the compact summary strip on top carries the status of all three.
export default function AccountAreaPassportAwards() {
  const { t } = useI18n();
  const [section, setSection] = useState('awards');

  const items = useMemo(() => ([
    { key: 'awards', label: t('passportAwards.tabAwards') },
    { key: 'passport', label: t('passportAwards.tabPassport') },
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

      <div className="space-y-4">
        <PassportAwardsSummaryCard section={section} onGo={setSection} />
        {section === 'awards' ? <CommunityArea /> : null}
        {section === 'passport' ? <PassportArea section="visited" /> : null}
        {section === 'bucket' ? <PassportArea section="bucket" /> : null}
      </div>
    </>
  );
}