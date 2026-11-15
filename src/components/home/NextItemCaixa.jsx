import React from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import NextBriefCard from '@/components/home/NextBriefCard';
import HeroSkeleton from '@/components/home/HeroSkeleton';
import { journeyIcon } from '@/lib/journeyIcons';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((x) => [x.key, x.color]));

// BOX A — the current/next ITEM intelligence box. It owns the NOW/NEXT header
// line, the featured segment card and the Next brief attached to it. That brief
// keeps its own dedupe/intelligence behaviour (NextBriefCard); this box only
// frames it. It knows nothing about the gatherings carousel below it.
export default function NextItemCaixa({ next, people = [], loading = false, totalCount = 0 }) {
  const { t } = useI18n();
  const now = new Date();
  const item = next?.item;

  if (loading && !next) {
    return <HeroSkeleton />;
  }

  if (!next || !item) {
    return totalCount > 0 ? (
      <div className="tt-card-hairline p-3.5 sm:p-4">
        <p className="text-sm text-ink-deep/60">{t('home.featuredEmpty')}</p>
      </div>
    ) : null;
  }

  const start = item.start_datetime ? new Date(item.start_datetime) : null;
  const refDate = next.ongoing ? now : start;
  const absDate = refDate ? format(refDate, 'EEE, MMM d') : '';
  const days = start ? differenceInCalendarDays(start, now) : 0;
  const relative = next.ongoing || days <= 0
    ? t('home.today')
    : days === 1
      ? t('home.tomorrow')
      : t('home.inDays', { count: days });

  return (
    <div className="tt-card-hairline p-3.5 sm:p-4">
      <p className="text-sm font-bold tracking-wide flex flex-wrap items-center gap-x-2 px-0.5 mb-3 min-w-0">
        <span className="text-terra-coral uppercase">{next.ongoing ? t('home.happeningNow') : t('home.upNext')}</span>
        <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
        <span className="text-ink-deep uppercase">{relative}</span>
        {absDate && <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />}
        {absDate && <span className="text-ink-deep/75">{absDate}</span>}
      </p>

      <JourneyCard
        item={item}
        leg={item.type === 'hotel' ? 'check-in' : undefined}
        typeColor={TYPE_COLOR[item.type] || TYPE_COLOR.other}
        icon={journeyIcon(item.type)}
        participants={people}
        showImages
        embedded
        to={`/gathering/${next.gatheringId}/journey/${item.id}`}
      />

      <div className="px-0.5">
        <NextBriefCard next={next} />
      </div>
    </div>
  );
}