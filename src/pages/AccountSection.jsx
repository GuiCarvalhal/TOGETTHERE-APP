import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AppHeader from '@/components/tt/AppHeader';
import { ACCOUNT_AREAS } from '@/components/account/accountAreas';
import AccountAreaPersonal from '@/components/account/AccountAreaPersonal';
import AccountAreaPreferences from '@/components/account/AccountAreaPreferences';
import AccountAreaIntegrations from '@/components/account/AccountAreaIntegrations';
import AccountAreaCommunity from '@/components/account/AccountAreaCommunity';
import AccountAreaSecurity from '@/components/account/AccountAreaSecurity';
import { useAuth } from '@/lib/AuthContext';

const AREA_CONTENT = {
  personal: AccountAreaPersonal,
  preferences: AccountAreaPreferences,
  integrations: AccountAreaIntegrations,
  community: AccountAreaCommunity,
  security: AccountAreaSecurity,
};

// Account area — STEP 2 of the account flow. Shows ONLY the selected area: each
// area renders the standard action bar (orange Back + its own contextual
// actions) directly under the app header, then its title and controls. The route
// segment is the area key, so every area is directly linkable; an unknown
// segment goes back to the hub instead of showing a half-empty page.
export default function AccountSection() {
  const { section } = useParams();
  const { user } = useAuth();

  if (!user?.id) return <Navigate to="/" replace />;

  const area = ACCOUNT_AREAS.find((entry) => entry.key === section);
  if (!area) return <Navigate to="/account" replace />;

  const Area = AREA_CONTENT[area.key];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader />
      <div className="tt-page py-4 pb-28">
        <Area />
      </div>
    </div>
  );
}