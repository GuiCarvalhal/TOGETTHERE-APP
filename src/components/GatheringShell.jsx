import React, { useEffect, useState } from 'react';
import { useParams, Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { GatheringProvider, useGathering } from '@/lib/gatheringContext';
import { gatheringDateStatus, deriveGatheringMeta } from '@/lib/gatheringDates';
import GatheringHero from '@/components/tt/GatheringHero';
import { useI18n } from '@/lib/i18n';
import BottomTabBar from '@/components/tt/BottomTabBar';
import MoreMenu from '@/components/tt/MoreMenu';
import TopBar from '@/components/tt/TopBar';
import NotificationOptInBanner from '@/components/tt/NotificationOptInBanner';
import { useAuth } from '@/lib/AuthContext';
import { useOneSignal } from '@/lib/useOneSignal';
import { readLastSection, writeLastSection, sectionFromPath, sectionAllowedForRole } from '@/lib/gatheringLastPage';
import { useOfflineGatheringCache } from '@/lib/useOfflineSync';
import { Loader2, Plus } from 'lucide-react';

function FabButton() {
  const { fab } = useGathering();
  if (!fab) return null;
  const Icon = fab.icon || Plus;
  return (
    <button
      onClick={fab.onClick}
      className="fixed right-5 tt-fab-over-tab z-40 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full bg-terra text-cream font-semibold shadow-[0_12px_30px_rgba(224,90,71,0.45)] hover:bg-terra-deep transition-colors"
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm">{fab.label}</span>
    </button>
  );
}

function ShellInner() {
  const { id } = useParams();
  const { gathering, role, loading, error, currentMember, journeyItems, members } = useGathering();
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const onesignal = useOneSignal(user?.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

  // Populate the offline IndexedDB cache from successfully loaded gathering
  // context. Fires only after a non-error, non-loading load — auth/network
  // errors never produce a stale cache entry. No auth tokens stored.
  useOfflineGatheringCache({
    userId: currentMember?.user_id || user?.id,
    gatheringId: id,
    role,
    gathering, members,
    error, loading,
  });

  // Remember the last gathering section this user visited for this gathering,
  // so re-entering the gathering returns them there instead of the default.
  useEffect(() => {
    const section = sectionFromPath(location.pathname);
    if (section && sectionAllowedForRole(section, role)) {
      writeLastSection(user?.id, id, section);
    }
  }, [location.pathname, id, role, user?.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-terra" />
      </div>
    );
  }
  if (error || !gathering) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-foreground px-6">
        <p className="font-display text-3xl mb-2">Gathering not found</p>
        <p className="text-foreground/60 mb-6">This trip may have been removed or you don't have access.</p>
        <Link to="/" className="px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Back to gatherings</Link>
      </div>
    );
  }

  if (location.pathname === `/gathering/${id}`) {
    const saved = readLastSection(user?.id, id);
    const target = saved && sectionAllowedForRole(saved, role) ? saved : 'journey';
    return <Navigate to={`/gathering/${id}/${target}`} replace />;
  }

  // Date label + range are derived from the gathering's journey items (the
  // current user's items first, falling back to all), never from a typed date.
  const uid = currentMember?.user_id;
  const dateStatus = gatheringDateStatus(gathering, journeyItems, uid, role);
  const meta = deriveGatheringMeta(gathering, journeyItems, uid, role, { t, formatDateTime: fmt.formatDateTime, formatDate: fmt.formatDate });

  // Any journey item detail route hides the gathering hero — the detail page
  // has its own sticky DetailActionBar (Back/Edit/Delete) as the first element
  // below the global TopBar. Excludes /new and /:itemId/edit (editor surfaces).
  // Pure route-based detection — no data lookup, no extra fetch or flash.
  const detailMatch = location.pathname.match(/^\/gathering\/[^/]+\/journey\/([^/]+)$/);
  const isItemDetail = !!detailMatch && detailMatch[1] !== 'new';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar gatheringId={id} onOpenMenu={() => setMoreOpen(true)} />
      {/* Cover-photo header — hidden on journey item detail */}
      {!isItemDetail && (
        <GatheringHero
          id={id}
          gathering={gathering}
          role={role}
          dateStatusLabel={dateStatus.label}
          meta={meta}
        />
      )}

      <NotificationOptInBanner onesignal={onesignal} gatheringId={id} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-2.5 pb-36">
        <Outlet context={{ openMore: () => setMoreOpen(true) }} />
      </main>

      <FabButton />
      <BottomTabBar gatheringId={id} role={role} />
      <MoreMenu open={moreOpen} onOpenChange={setMoreOpen} onesignal={onesignal} />
    </div>
  );
}

export default function GatheringShell() {
  const { id } = useParams();
  return (
    <GatheringProvider gatheringId={id}>
      <ShellInner />
    </GatheringProvider>
  );
}