import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import AppHeader from '@/components/tt/AppHeader';
import MemberAvatar from '@/components/tt/MemberAvatar';
import AccountMenuRow from '@/components/account/AccountMenuRow';
import { ACCOUNT_AREAS, ACCOUNT_SECTIONS, ACCOUNT_AREA_KEYS } from '@/components/account/accountAreas';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Account hub — STEP 1 of the account flow. A slim identity header plus stacked
// list sections: each section is a plain card of rows, so the menu stays calm and
// keeps growing without redesigning. Picking a row loads that area's own page
// (/account/<area>), where the areas are never stacked together again.
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

  const areaByKey = Object.fromEntries(ACCOUNT_AREAS.map((a) => [a.key, a]));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="tt-page py-6 pb-16">
        {/* Identity header — the only "card" at the top; everything below is list. */}
        <div className="flex items-center gap-3 mb-6">
          <MemberAvatar member={user} size="lg" />
          <div className="min-w-0">
            <p className="tt-label text-ink-deep/40">{t('account.account')}</p>
            <p className="font-display text-lg font-bold text-ink-deep leading-tight truncate">
              {user.full_name || user.email}
            </p>
            {user.email ? (
              <p className="text-xs text-ink-deep/50 truncate mt-0.5">{user.email}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          {ACCOUNT_SECTIONS.map((section) => {
            const areas = section.areaKeys.map((k) => areaByKey[k]).filter(Boolean);
            if (!areas.length) return null;
            return (
              <section key={section.key}>
                <h2 className="tt-label text-ink-deep/40 px-1 mb-2">{t(section.titleKey)}</h2>
                <div className="tt-card-hairline overflow-hidden">
                  {areas.map((area, i) => (
                    <AccountMenuRow key={area.key} area={area} last={i === areas.length - 1} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Sign out — one clear action below the menu, outside every area. */}
        <Button size="lg" className="w-full mt-6" onClick={() => logout()}>
          <LogOut /> {t('account.signOut')}
        </Button>
      </div>
    </div>
  );
}