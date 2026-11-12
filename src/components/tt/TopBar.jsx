import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import ActivityBell from '@/components/tt/ActivityBell';
import MemberAvatar from '@/components/tt/MemberAvatar';
import BrandLogo from '@/components/tt/BrandLogo';
import ConnectivityIndicator from '@/components/tt/ConnectivityIndicator';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';
import { refreshInboxCount, subscribeInboxCount } from '@/lib/inboxBadge';

// Universal app header used on every page (Home, gathering pages, Account,
// How-it-works). Left: the TOGETTHERE brand mark + wordmark. Right: the journey
// inbox shortcut (with its pending badge), the activity bell (gathering-scoped)
// and the signed-in user's avatar, which navigates straight to the Account hub
// page (/account) — the hub then offers the four areas as cards. No menu opens
// from the avatar. Sticky at h-12 (3rem) so the shared StickyBar action bars pin
// directly below it at calc(3rem + env(safe-area-inset-top)) with no overlap.
// The bar is fully opaque on purpose: a translucent + backdrop-blurred surface
// let the scrolled page show through and blurred the brand mark, wordmark and
// avatar. The whole brand lockup (logo + wordmark) links to Home.
export default function TopBar({ gatheringId }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const photo = user?.photo || user?.picture;
  const label = user?.full_name || user?.email || t('topbar.yourProfile');
  // Inbox entry: reachable from every page, with the number of items still
  // waiting there (imported reservations + transactions to review).
  const [inboxCount, setInboxCount] = useState(0);
  useEffect(() => {
    const unsubscribe = subscribeInboxCount(setInboxCount);
    if (!user) return unsubscribe;
    refreshInboxCount();
    // Automatic mailbox sync runs in the background, so the badge re-checks
    // itself once a minute — new arrivals show up without opening the inbox.
    const timer = setInterval(() => refreshInboxCount({ maxAgeMs: 55000 }), 60000);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [user]);

  return (
    <div className="sticky top-0 z-40 bg-background border-b border-foreground/8 tt-safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <Link
          to="/"
          aria-label="TOGETTHERE — home"
          className="inline-flex items-center gap-2 min-h-[36px] select-none rounded-full transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo className="w-7 h-7" />
          <span className="font-display font-bold tracking-tight text-foreground text-lg leading-none whitespace-nowrap">TOGETTHERE</span>
        </Link>
        <div className="flex items-center gap-1">
          <ConnectivityIndicator />
          <button
            onClick={() => navigate('/inbox')}
            aria-label={inboxCount > 0 ? t('topbar.inboxCount', { count: inboxCount }) : t('topbar.inbox')}
            className="relative inline-flex items-center justify-center rounded-full min-h-[36px] min-w-[36px] text-ink-deep/70 hover:text-ink-deep hover:bg-foreground/5 transition focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Inbox className="w-[18px] h-[18px]" />
            {inboxCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-terra text-cream text-[10px] font-bold leading-none">
                {inboxCount > 99 ? '99+' : inboxCount}
              </span>
            )}
          </button>
          <ActivityBell gatheringId={gatheringId} />
          <button
            type="button"
            onClick={() => navigate('/account')}
            aria-label={t('topbar.openAccount')}
            className="rounded-full transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
          >
            <MemberAvatar member={{ photo, full_name: label }} size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}