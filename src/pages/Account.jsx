import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AppHeader from '@/components/tt/AppHeader';
import AccountHubCard from '@/components/account/AccountHubCard';
import { ACCOUNT_AREAS, ACCOUNT_AREA_KEYS } from '@/components/account/accountAreas';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Account hub — STEP 1 of the account flow. The avatar in the shared header
// opens this page, which shows ONLY four large cards (the four areas) and
// nothing else. Picking one loads that area's own page (/account/<area>), where
// the areas are never stacked together again.
//
// Legacy /account#<area> links (old bookmarks, older in-app links) are folded
// into the area routes so every direct link keeps working.
export default function Account() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const { hash } = useLocation();

  if (!user?.id) return <Navigate to="/" replace />;

  const legacyArea = (hash || '').replace('#', '');
  if (legacyArea && ACCOUNT_AREA_KEYS.includes(legacyArea)) {
    return <Navigate to={`/account/${legacyArea}`} replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="tt-page py-6 pb-16">
        <p className="tt-label text-ink-deep/45">{t('account.settingsAccount')}</p>
        <h1 className="font-display text-2xl font-bold text-ink-deep mt-1">{t('account.account')}</h1>
        <p className="text-sm text-ink-deep/55 mt-1.5 mb-6">{t('account.chooseArea')}</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {ACCOUNT_AREAS.map((area) => (
            <AccountHubCard key={area.key} area={area} />
          ))}
        </div>

        {/* Sign out — one clear action below the area menu, outside every area. */}
        <Button size="lg" className="w-full mt-6" onClick={() => logout()}>
          <LogOut /> {t('account.signOut')}
        </Button>
      </div>
    </div>
  );
}