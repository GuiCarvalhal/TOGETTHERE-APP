import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StickyBar from '@/components/tt/StickyBar';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

// Standard account-area action bar: pinned directly under the app header
// (StickyBar's shared offset), orange Back on the left and an optional
// contextual action slot on the right. Personal Info renders the same chrome
// through ProfileActionBar, which adds Edit / Save / Cancel to this slot.
export default function AccountAreaBar({ children }) {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <StickyBar>
      <Button
        variant="default"
        size="icon"
        onClick={() => navigate('/account')}
        aria-label={t('account.account')}
        className="shrink-0"
      >
        <ArrowLeft />
      </Button>
      {children ? <div className="ml-auto flex items-center gap-2">{children}</div> : null}
    </StickyBar>
  );
}