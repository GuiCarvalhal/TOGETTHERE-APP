import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import AppHeader from '@/components/tt/AppHeader';
import { ACCOUNT_AREAS } from '@/components/account/accountAreas';
import AccountAreaPersonal from '@/components/account/AccountAreaPersonal';
import AccountAreaPreferences from '@/components/account/AccountAreaPreferences';
import AccountAreaIntegrations from '@/components/account/AccountAreaIntegrations';
import AccountAreaSecurity from '@/components/account/AccountAreaSecurity';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

const AREA_CONTENT = {
  personal: AccountAreaPersonal,
  preferences: AccountAreaPreferences,
  integrations: AccountAreaIntegrations,
  security: AccountAreaSecurity,
};

// Account area — STEP 2 of the account flow. Shows ONLY the selected area: one
// back link to the hub, the area title and description, then that area's
// existing controls untouched. The route segment is the area key
// (/account/personal, /account/preferences, /account/integrations,
// /account/security), so each area is directly linkable and shareable; an
// unknown segment goes back to the hub instead of showing a half-empty page.
export default function AccountSection() {
  const { section } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();

  if (!user?.id) return <Navigate to="/" replace />;

  const area = ACCOUNT_AREAS.find((entry) => entry.key === section);
  if (!area) return <Navigate to="/account" replace />;

  const Area = AREA_CONTENT[area.key];
  const Icon = area.Icon;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="tt-page py-5 pb-28">
        <Link
          to="/account"
          className="inline-flex items-center gap-1.5 min-h-[32px] text-xs font-semibold text-ink-deep/55 hover:text-ink-deep transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('account.account')}
        </Link>

        <div className="mt-2 mb-5">
          <h1 className="font-display text-2xl font-bold text-ink-deep flex items-center gap-2 min-w-0">
            <span className="grid place-items-center w-8 h-8 rounded-full bg-terra/10 text-terra-deep shrink-0">
              <Icon className="w-4 h-4" />
            </span>
            <span className="truncate">{t(area.titleKey)}</span>
          </h1>
          <p className="text-sm text-ink-deep/55 mt-1.5">{t(area.descKey)}</p>
        </div>

        <Area />
      </div>
    </div>
  );
}