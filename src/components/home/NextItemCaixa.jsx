import React from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import NextBriefCard from '@/components/home/NextBriefCard';
import HeroSkeleton from '@/components/home/HeroSkeleton';
import SegmentMap from '@/components/journey/SegmentMap';
import { journeyIcon } from '@/lib/journeyIcons';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useDeviceLayout } from '@/hooks/useDeviceLayout';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((x) => [x.key, x.color]));

// "1 h 7 min" from a millisecond span — the countdown shown once the item is
// less than 24 hours away.
function timeLeft(ms, t) {
  const mins = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  if (!hours) return t('home.brief.min', { count: rest });
  return rest
    ? t('home.brief.hourMin', { hours, minutes: rest })
    : t('home.brief.hours', { count: hours });
}

// BOX A — the current/next ITEM intelligence box. It owns the NOW/NEXT header
// line, the featured segment card and the Next brief attached to it. That brief
// keeps its own dedupe/intelligence behaviour (NextBriefCard); this box only
// frames it. It knows nothing about the gatherings carousel below it.
//
// ONE box, two arrangements of the same content (the same split the Journey page
// uses): on a desktop-width window the featured card sits on the left at its
// standard height and the context panel (map + brief) sits on the right, inside
// the same box; on phones and portrait tablets everything stays stacked in one
// column, and the map is not even mounted, so nothing extra is fetched there.
export default function NextItemCaixa({ next, people = [], loading = false, totalCount = 0 }) {
  const { t } = useI18n();
  const desktop = useDeviceLayout() === 'desktop';
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
  // Inside the 24 hours before a timed item starts, the header counts down to it
  // (hours + minutes) instead of naming the day.
  const msLeft = start ? start.getTime() - now.getTime() : null;
  const countdown = !next.ongoing && msLeft !== null && msLeft > 0 && msLeft <= 86400000;
  const relative = countdown
    ? t('home.inTime', { time: timeLeft(msLeft, t) })
    : next.ongoing || days <= 0
      ? t('home.today')
      : days === 1
        ? t('home.tomorrow')
        : t('home.inDays', { count: days });

  const mapQuery = item.location_name || item.location_to || item.location_from || item.title || '';

  return (
    <div className="tt-card-hairline p-3.5 sm:p-4">
      <p className="text-sm font-bold tracking-wide flex flex-wrap items-center gap-x-2 px-0.5 mb-3 min-w-0">
        <span className="text-terra-coral uppercase">{next.ongoing ? t('home.happeningNow') : t('home.upNext')}</span>
        <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
        <span className="text-ink-deep uppercase">{relative}</span>
        {absDate && <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />}
        {absDate && <span className="text-ink-deep/75">{absDate}</span>}
      </p>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-4 lg:items-start">
        <div className="min-w-0">
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
        </div>

        <div className="mt-3 lg:mt-0 space-y-3 min-w-0">
          {desktop && mapQuery && (
            <SegmentMap
              origin={item.from_place}
              destination={item.to_place}
              point={item.place}
              query={mapQuery}
              isFlight={item.type === 'flight'}
              heightClass="h-40"
            />
          )}
          <NextBriefCard next={next} />
        </div>
      </div>
    </div>
  );
}