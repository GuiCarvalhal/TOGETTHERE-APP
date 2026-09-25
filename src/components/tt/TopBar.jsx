import React from 'react';
import { Link } from 'react-router-dom';
import ActivityBell from '@/components/tt/ActivityBell';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { useAuth } from '@/lib/AuthContext';

// Slim persistent app frame above gathering content. The TOGETTHERE wordmark is
// the primary home/back-to-gatherings affordance. The bell shows recent gathering
// activity with an unread badge; the avatar opens the user profile sheet.
export default function TopBar({ gatheringId }) {
  const { user } = useAuth();
  const photo = user?.photo || user?.picture;
  const label = user?.full_name || user?.email || 'your profile';

  return (
    <div className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-foreground/8 tt-safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <Link to="/" aria-label="TOGETTHERE home" className="inline-flex items-center gap-1.5 group min-h-[36px]">
          <span className="w-2 h-2 rounded-full bg-terra group-hover:scale-110 transition-transform" />
          <span className="font-display font-bold tracking-tight text-foreground text-lg leading-none">TOGETTHERE</span>
        </Link>
        <div className="flex items-center gap-1">
          <ActivityBell gatheringId={gatheringId} />
          <Link to={`/profile/${user?.id}?g=${gatheringId}`} aria-label="Open your profile" className="rounded-full transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]">
            <MemberAvatar member={{ photo, full_name: label }} size="sm" />
          </Link>
        </div>
      </div>
    </div>
  );
}