import React, { useState } from 'react';
import { useParams, Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { GatheringProvider, useGathering } from '@/lib/gatheringContext';
import { formatDateRange } from '@/lib/gatheringHelpers';
import BottomTabBar from '@/components/tt/BottomTabBar';
import MoreMenu from '@/components/tt/MoreMenu';
import NotificationOptInBanner from '@/components/tt/NotificationOptInBanner';
import { useAuth } from '@/lib/AuthContext';
import { useOneSignal } from '@/lib/useOneSignal';
import { Image } from '@/components/ui/image';
import { Loader2, ChevronLeft, CalendarDays, MapPin, Plus } from 'lucide-react';

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
  const { gathering, role, loading, error } = useGathering();
  const { user } = useAuth();
  const onesignal = useOneSignal(user?.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

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
    return <Navigate to={`/gathering/${id}/journey`} replace />;
  }

  const statusLabel = gathering.status === 'active' ? 'Active Trip' : gathering.status === 'completed' ? 'Completed' : 'In Planning';

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Cover-photo header */}
      <header className="relative">
        <div className="relative h-[124px] sm:h-[168px] w-full overflow-hidden">
          {gathering.cover_image ? (
            <Image src={gathering.cover_image} alt={gathering.name} className="w-full h-full object-cover" fittingType="fill" />
          ) : (
            <div className="w-full h-full bg-ink-deep flex items-center justify-center">
              <span className="font-display italic text-white/20 text-4xl">TOGETTHERE</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6 tt-safe-top">
          <Link to="/" className="inline-flex items-center gap-0.5 text-white/90 hover:text-white text-sm font-medium self-start -ml-1">
            <ChevronLeft className="w-4 h-4" /> Gatherings
          </Link>
          <div>
            <span className="tt-label text-white/80 block mb-1">{statusLabel}</span>
            <h1 className="font-display text-2xl sm:text-4xl font-bold text-white tt-text-balance leading-tight">{gathering.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-white/85 text-xs sm:text-sm">
              {gathering.start_date && (
                <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDateRange(gathering.start_date, gathering.end_date)}</span>
              )}
              {gathering.destinations?.length > 0 && (
                <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{gathering.destinations.join(' · ')}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <NotificationOptInBanner onesignal={onesignal} gatheringId={id} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-36">
        <Outlet />
      </main>

      <FabButton />
      <BottomTabBar gatheringId={id} role={role} onMore={() => setMoreOpen(true)} />
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