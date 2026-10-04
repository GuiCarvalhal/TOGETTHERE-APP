import React from 'react';
import ActivityBell from '@/components/tt/ActivityBell';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { useAuth } from '@/lib/AuthContext';

// Universal app header used on every page (Home, gathering pages, Profile,
// How-it-works). Left: the TOGETTHERE brand mark + wordmark (non-interactive;
// Home navigation lives in the gathering's primary menu). Right: the activity
// bell and the signed-in user's avatar (opens MoreMenu via onOpenMenu).
// Sticky at h-12 (3rem) so the shared StickyBar action bars pin directly below
// it at calc(3rem + env(safe-area-inset-top)) with no overlap or jump.
export default function TopBar({ gatheringId, onOpenMenu }) {
  const { user } = useAuth();
  const photo = user?.photo || user?.picture;
  const label = user?.full_name || user?.email || 'your profile';

  return (
    <div className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-foreground/8 tt-safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="inline-flex items-center gap-1.5 min-h-[36px] select-none">
          <img src="/icon.svg" alt="" className="w-6 h-6 rounded-[6px] object-cover" aria-hidden />
          <span className="font-display font-bold tracking-tight text-foreground text-lg leading-none">TOGETTHERE</span>
        </div>
        <div className="flex items-center gap-1">
          <ActivityBell gatheringId={gatheringId} />
          <button onClick={onOpenMenu} aria-label="Open account menu" className="rounded-full transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]">
            <MemberAvatar member={{ photo, full_name: label }} size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}