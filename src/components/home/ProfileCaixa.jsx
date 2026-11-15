import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, BookMarked, UserRound } from 'lucide-react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { useI18n } from '@/lib/i18n';

// "Caixa" = Home's large thematic card. This one is the profile summary: who you
// are, two counts, and the two personal destinations. It reads as one immersive
// surface rather than a row of small tiles.
export default function ProfileCaixa({ user, gatheringCount = 0, upcomingCount = 0 }) {
  const { t } = useI18n();

  const rows = [
    { to: '/account/personal', Icon: UserRound, label: t('account.menuPersonal') },
    { to: '/account/passport-awards', Icon: BookMarked, label: t('account.menuPassportAwards') },
  ];

  return (
    <section className="tt-card-hairline overflow-hidden flex flex-col">
      <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-ink-charcoal/10">
        <MemberAvatar member={user} size="lg" />
        <div className="min-w-0">
          <p className="tt-label text-ink-deep/40">{t('home.profileCaixaLabel')}</p>
          <p className="font-display text-lg font-bold text-ink-deep leading-tight truncate">
            {user?.full_name || t('account.member')}
          </p>
          {user?.email ? (
            <p className="text-xs text-ink-deep/50 truncate mt-0.5">{user.email}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-ink-charcoal/10">
        <div className="px-4 sm:px-5 py-3">
          <p className="font-display text-xl font-bold text-ink-deep leading-none">{gatheringCount}</p>
          <p className="text-[0.6875rem] text-ink-deep/50 mt-1">{t('home.statGatherings')}</p>
        </div>
        <div className="px-4 sm:px-5 py-3 border-l border-ink-charcoal/10">
          <p className="font-display text-xl font-bold text-terra-deep leading-none">{upcomingCount}</p>
          <p className="text-[0.6875rem] text-ink-deep/50 mt-1">{t('home.statUpcoming')}</p>
        </div>
      </div>

      <div className="mt-auto">
        {rows.map((r, i) => (
          <Link
            key={r.to}
            to={r.to}
            className={`flex items-center gap-2.5 px-4 sm:px-5 py-3 text-sm font-semibold text-ink-deep transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              i === 0 ? '' : 'border-t border-ink-charcoal/10'
            }`}
          >
            <r.Icon className="w-4 h-4 text-terra-deep shrink-0" />
            <span className="truncate">{r.label}</span>
            <ChevronRight className="w-4 h-4 text-ink-deep/30 ml-auto shrink-0" />
          </Link>
        ))}
      </div>
    </section>
  );
}