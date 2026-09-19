import React from 'react';
import { useParams, Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import { GatheringProvider, useGathering } from '@/lib/gatheringContext';
import { formatDateRange, formatDate } from '@/lib/gatheringHelpers';
import PillSwitcher from '@/components/tt/PillSwitcher';
import MemberAvatar from '@/components/tt/MemberAvatar';
import RoleStamp from '@/components/tt/RoleStamp';
import { Image } from '@/components/ui/image';
import { Loader2, MapPin, CalendarDays, Plus, Sparkles, Receipt, UserPlus } from 'lucide-react';

function FabButton() {
  const { fab } = useGathering();
  if (!fab) return null;
  const Icon = fab.icon || Plus;
  return (
    <button
      onClick={fab.onClick}
      className="group fixed right-5 bottom-6 sm:bottom-8 z-40 flex items-center gap-2 pl-4 pr-5 py-3.5 rounded-full bg-terra text-cream font-semibold shadow-[0_12px_30px_rgba(224,90,71,0.45)] hover:bg-terra-deep transition-colors"
    >
      <Icon className="w-5 h-5" />
      <span className="text-sm">{fab.label}</span>
    </button>
  );
}

function ShellInner() {
  const { id } = useParams();
  const { gathering, members, currentMember, role, loading, error, fab } = useGathering();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-ink">
        <Loader2 className="w-8 h-8 animate-spin text-terra" />
      </div>
    );
  }
  if (error || !gathering) {
    return (
      <div className="min-h-screen bg-ink flex flex-col items-center justify-center text-cream px-6">
        <p className="font-display text-3xl mb-2">Gathering not found</p>
        <p className="text-cream/60 mb-6">This trip may have been removed or you don't have access.</p>
        <Link to="/" className="px-5 py-2.5 rounded-full bg-terra text-cream font-semibold">Back to gatherings</Link>
      </div>
    );
  }

  // redirect bare /gathering/:id to journey (or agent if viewer can't... journey is fine for all)
  if (location.pathname === `/gathering/${id}`) {
    return <Navigate to={`/gathering/${id}/journey`} replace />;
  }

  const participants = members.filter((m) => m.role === 'owner' || m.role === 'member');

  return (
    <div className="min-h-screen bg-ink text-cream">
      {/* Top header */}
      <header className="sticky top-0 z-30 bg-ink/85 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <span className="font-display text-xl sm:text-2xl font-bold tracking-tight text-cream">TOGETTHERE</span>
          </Link>
          <div className="hidden md:flex items-center gap-3 min-w-0">
            <span className="font-display text-lg italic text-cream/90 truncate">{gathering.name}</span>
            <span className="tt-stamp bg-terra/15 text-terra-coral border-terra/30 capitalize">{gathering.status}</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex -space-x-2.5">
              {participants.slice(0, 4).map((m) => (
                <MemberAvatar key={m.id} member={m} size="sm" className="ring-2 ring-ink" />
              ))}
              {participants.length > 4 && (
                <div className="w-9 h-9 rounded-full bg-ink-soft border-2 border-ink flex items-center justify-center text-xs font-semibold text-cream/70">
                  +{participants.length - 4}
                </div>
              )}
            </div>
            {currentMember && <RoleStamp role={role} size="xs" className="hidden sm:inline-flex" />}
          </div>
        </div>
      </header>

      {/* Pill switcher */}
      <div className="sticky top-16 z-20 -mt-px pt-4 pb-3 bg-gradient-to-b from-ink/95 to-ink/0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex justify-center">
          <PillSwitcher gatheringId={id} role={role} />
        </div>
      </div>

      {/* Cover hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-2">
        <div className="relative rounded-[1.5rem] overflow-hidden border border-white/10 tt-shadow-float">
          <div className="aspect-[16/7] sm:aspect-[16/5] w-full">
            {gathering.cover_image ? (
              <Image src={gathering.cover_image} alt={gathering.name} className="w-full h-full object-cover" fittingType="fill" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-ink-soft via-ink to-ink-deep flex items-center justify-center">
                <span className="font-display italic text-cream/30 text-5xl">TOGETTHERE</span>
              </div>
            )}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
          <div className="absolute inset-0 p-5 sm:p-8 flex flex-col justify-end">
            <span className="tt-label text-terra-coral mb-2">{gathering.status === 'active' ? 'Active Trip' : gathering.status === 'completed' ? 'Completed' : 'In Planning'}</span>
            <h1 className="font-display text-3xl sm:text-5xl font-bold text-cream tt-text-balance leading-tight">{gathering.name}</h1>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-cream/80 text-sm">
              {gathering.start_date && (
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-4 h-4 text-terra-coral" />{formatDateRange(gathering.start_date, gathering.end_date)}</span>
              )}
              {gathering.destinations?.length > 0 && (
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-4 h-4 text-terra-coral" />{gathering.destinations.join(' · ')}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Active area content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 pb-28">
        <Outlet />
      </main>

      <FabButton />
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