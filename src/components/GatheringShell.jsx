import React, { useEffect, useState } from 'react';
import { useParams, Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { GatheringProvider, useGathering } from '@/lib/gatheringContext';
import { gatheringDateStatus, formatGatheringRange, gatheringDestinations, destinationMapsUrl } from '@/lib/gatheringDates';
import { canManageGathering } from '@/lib/gatheringHelpers';
import BottomTabBar from '@/components/tt/BottomTabBar';
import MoreMenu from '@/components/tt/MoreMenu';
import TopBar from '@/components/tt/TopBar';
import NotificationOptInBanner from '@/components/tt/NotificationOptInBanner';
import { useAuth } from '@/lib/AuthContext';
import { useOneSignal } from '@/lib/useOneSignal';
import { readLastSection, writeLastSection, sectionFromPath, sectionAllowedForRole } from '@/lib/gatheringLastPage';
import { Image } from '@/components/ui/image';
import { Loader2, CalendarDays, MapPin, Plus, MessageCircle, Music, ExternalLink, Settings } from 'lucide-react';

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
  const { gathering, role, loading, error, currentMember, journeyItems } = useGathering();
  const { user } = useAuth();
  const onesignal = useOneSignal(user?.id);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();

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
  const dateStatus = gatheringDateStatus(gathering, journeyItems, uid);
  const dateRange = formatGatheringRange(gathering, journeyItems, uid);
  const dests = gatheringDestinations(gathering);

  // Flight detail route: hide the gathering hero (flight detail has its own
  // compact header). Non-flight detail keeps the hero. Detected from the
  // already-loaded journeyItems (id + type) so there's no extra fetch or flash.
  const detailMatch = location.pathname.match(/^\/gathering\/[^/]+\/journey\/([^/]+)$/);
  const detailItemId = detailMatch?.[1];
  const detailItem = detailItemId && detailItemId !== 'new' ? journeyItems.find((j) => j.id === detailItemId) : null;
  const isFlightDetail = detailItem?.type === 'flight';

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopBar gatheringId={id} onOpenMenu={() => setMoreOpen(true)} />
      {/* Cover-photo header — hidden on flight detail */}
      {!isFlightDetail && <header className="relative">
        <div className="relative h-[124px] sm:h-[168px] w-full overflow-hidden">
          {gathering.cover_image ? (
            <Image src={gathering.cover_image} alt={gathering.name} className="w-full h-full object-cover" fittingType="fill" />
          ) : (
            <div className="w-full h-full bg-ink-scrim flex items-center justify-center">
              <span className="font-display italic text-white/20 text-4xl">TOGETTHERE</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/25" />
        </div>
        {(canManageGathering(role) || gathering.whatsapp_url || gathering.music_url) && (
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            {canManageGathering(role) && (
              <Link to={`/gathering/${id}/settings`} aria-label="Gathering settings" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
                <Settings className="w-5 h-5" />
              </Link>
            )}
            {gathering.music_url && (
              <a href={gathering.music_url} target="_blank" rel="noopener noreferrer" aria-label="Open gathering playlist" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
                <Music className="w-5 h-5" />
              </a>
            )}
            {gathering.whatsapp_url && (
              <a href={gathering.whatsapp_url} target="_blank" rel="noopener noreferrer" aria-label="Open WhatsApp group" className="w-11 h-11 rounded-full flex items-center justify-center bg-black/35 backdrop-blur-sm text-white hover:bg-black/50 transition-colors">
                <MessageCircle className="w-5 h-5" />
              </a>
            )}
          </div>
        )}
        <div className="absolute inset-0 flex flex-col justify-end p-4 sm:p-6">
          <div>
            <span className="tt-label text-white/80 block mb-1">{dateStatus.label}</span>
            <h1 className="font-display text-2xl sm:text-4xl font-bold text-white tt-text-balance leading-tight">{gathering.name}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-white/85 text-xs sm:text-sm">
              {dateRange && (
                <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{dateRange}</span>
              )}
              {dests.length > 0 && (
                <span className="inline-flex items-center gap-1.5 flex-wrap">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {dests.map((d, i) => {
                    const url = destinationMapsUrl(d);
                    const sep = i < dests.length - 1 ? ' · ' : '';
                    return (
                      <span key={i} className="inline-flex items-center gap-0.5">
                        {url ? (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/40 hover:decoration-white inline-flex items-center gap-0.5">
                            {d.name}<ExternalLink className="w-3 h-3 opacity-70" />
                          </a>
                        ) : d.name}
                        {sep}
                      </span>
                    );
                  })}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>}

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