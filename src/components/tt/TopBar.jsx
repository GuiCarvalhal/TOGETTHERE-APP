import React from 'react';
import { useNavigate } from 'react-router-dom';
import ActivityBell from '@/components/tt/ActivityBell';
import MemberAvatar from '@/components/tt/MemberAvatar';
import BrandLogo from '@/components/tt/BrandLogo';
import ConnectivityIndicator from '@/components/tt/ConnectivityIndicator';
import { useAuth } from '@/lib/AuthContext';
import { useI18n } from '@/lib/i18n';

// Universal app header used on every page (Home, gathering pages, Account,
// How-it-works). Left: the TOGETTHERE brand mark + wordmark. Right: the
// activity bell (gathering-scoped) and the signed-in user's avatar, which
// opens the ONE canonical Account page (/account) — a full page, not a
// drawer — from both Home and every in-gathering page. Sticky at h-12 (3rem)
// so the shared StickyBar action bars pin directly below it at
// calc(3rem + env(safe-area-inset-top)) with no overlap or jump.
export default function TopBar({ gatheringId }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const photo = user?.photo || user?.picture;
  const label = user?.full_name || user?.email || t('topbar.yourProfile');

  return (
    <div className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-foreground/8 tt-safe-top">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 min-h-[36px] select-none">
          <BrandLogo className="w-7 h-7" />
          <span className="font-display font-bold tracking-tight text-foreground text-lg leading-none">TOGETTHERE</span>
        </div>
        <div className="flex items-center gap-1">
          <ConnectivityIndicator />
          <ActivityBell gatheringId={gatheringId} />
          <button
            onClick={() => navigate('/account')}
            aria-label={t('topbar.openAccountMenu')}
            className="rounded-full transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring min-h-[36px]"
          >
            <MemberAvatar member={{ photo, full_name: label }} size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}