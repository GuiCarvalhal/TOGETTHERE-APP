import React, { useRef } from 'react';
import { Plus, ChevronLeft, ChevronRight, Compass, RotateCw } from 'lucide-react';
import { format, differenceInCalendarDays } from 'date-fns';
import { Button } from '@/components/ui/button';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import GatheringCard from '@/components/tt/cards/GatheringCard';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import NextBriefCard from '@/components/home/NextBriefCard';
import { journeyIcon } from '@/lib/journeyIcons';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((x) => [x.key, x.color]));

// THE gatherings caixa — the single surface Home uses for trips, top to bottom:
//   1. header line: NEXT / NOW (+ how soon, + date) with the New action on the right
//   2. the featured card: the current/next trip's segment, with the Next brief
//      intelligence attached underneath it (same component, same behaviour)
//   3. the Upcoming / Past switch
//   4. the remaining gatherings as cards in a horizontal carousel — native swipe
//      on touch, explicit arrow buttons where a hover pointer exists
// The featured trip is never repeated in the strip; the strip shows the rest.
export default function GatheringsCaixa({
  loading,
  loadError,
  onRetry,
  nextUpcoming,
  featuredPeople,
  upcoming = [],
  past = [],
  filter,
  onFilterChange,
  roleOf,
  previews,
  totalCount = 0,
  onNew,
}) {
  const { t } = useI18n();
  const trackRef = useRef(null);
  const now = new Date();

  const featuredId = nextUpcoming?.gatheringId || null;
  const listed = filter === 'past' ? past : upcoming;
  const cards = filter === 'upcoming' && featuredId
    ? listed.filter((a) => a.g.id !== featuredId)
    : listed;

  // Header line — the same NEXT/NOW wording the featured module always used.
  const eyebrow = nextUpcoming
    ? (() => {
        const start = nextUpcoming.item?.start_datetime ? new Date(nextUpcoming.item.start_datetime) : null;
        const refDate = nextUpcoming.ongoing ? now : start;
        const absDate = refDate ? format(refDate, 'EEE, MMM d') : '';
        const days = start ? differenceInCalendarDays(start, now) : 0;
        const relative = nextUpcoming.ongoing || days <= 0
          ? t('home.today')
          : days === 1
            ? t('home.tomorrow')
            : t('home.inDays', { count: days });
        return {
          statusLabel: nextUpcoming.ongoing ? t('home.happeningNow') : t('home.upNext'),
          relative,
          absDate,
        };
      })()
    : null;

  function scrollStrip(dir) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('[data-card]');
    const step = card ? card.getBoundingClientRect().width + 12 : Math.round(el.clientWidth * 0.85);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  const emptyLine = cards.length
    ? ''
    : filter === 'past'
      ? t('home.noPast')
      : featuredId
        ? t('home.noOtherGatherings')
        : t('home.noUpcoming');

  return (
    <section className="tt-card-hairline overflow-hidden">
      {/* 1 — header line + New action */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        {eyebrow ? (
          <p className="text-sm font-bold tracking-wide flex flex-wrap items-center gap-x-2 min-w-0">
            <span className="text-terra-coral uppercase">{eyebrow.statusLabel}</span>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
            <span className="text-ink-deep uppercase">{eyebrow.relative}</span>
            <span aria-hidden="true" className="w-1 h-1 rounded-full bg-ink-deep/25" />
            <span className="text-ink-deep/75">{eyebrow.absDate}</span>
          </p>
        ) : (
          <p className="tt-label text-terra-coral min-w-0 truncate">{t('home.yourGatherings')}</p>
        )}
        <Button onClick={onNew} size="sm" className="shrink-0">
          <Plus /> {t('home.new')}
        </Button>
      </div>

      {/* 2 — featured card for the current / next trip */}
      {loading && !nextUpcoming ? (
        <div className="px-4 sm:px-5 pb-4 space-y-2">
          <Skeleton className="h-3 w-28" tone="cream" />
          <Skeleton className="h-[104px] w-full" tone="cream" />
        </div>
      ) : nextUpcoming ? (
        <div className="px-2.5 sm:px-3 pb-1">
          <JourneyCard
            item={nextUpcoming.item}
            leg={nextUpcoming.item.type === 'hotel' ? 'check-in' : undefined}
            typeColor={TYPE_COLOR[nextUpcoming.item.type] || TYPE_COLOR.other}
            icon={journeyIcon(nextUpcoming.item.type)}
            participants={featuredPeople || []}
            showImages
            embedded
            to={`/gathering/${nextUpcoming.gatheringId}/journey/${nextUpcoming.item.id}`}
          />
          <div className="px-1.5">
            <NextBriefCard next={nextUpcoming} />
          </div>
        </div>
      ) : totalCount > 0 ? (
        <p className="px-4 sm:px-5 pb-4 text-sm text-ink-deep/60">{t('home.featuredEmpty')}</p>
      ) : null}

      {/* 3 — Upcoming / Past switch, in the same caixa */}
      <div className="border-t border-ink-charcoal/10 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
        <div
          className="inline-flex rounded-full bg-foreground/5 p-1 border border-foreground/10"
          role="group"
          aria-label={t('home.yourGatherings')}
        >
          {[
            { key: 'upcoming', label: t('home.filterUpcoming') },
            { key: 'past', label: t('home.filterPast') },
          ].map((o) => {
            const active = filter === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => onFilterChange(o.key)}
                aria-pressed={active}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 — gatherings carousel */}
      {loadError && !loading ? (
        <div className="px-4 sm:px-5 pb-4 flex items-center justify-between gap-3">
          <p className="text-sm text-ink-deep/70 min-w-0">{t('home.couldNotLoad')}</p>
          <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
            <RotateCw />
            {t('common.tryAgain')}
          </Button>
        </div>
      ) : totalCount === 0 && !loading ? (
        <div className="px-4 sm:px-5 pb-4">
          <EmptyState
            icon={Compass}
            title={t('home.noGatherings')}
            body={t('home.noGatheringsBody')}
            action={<Button onClick={onNew}><Plus /> {t('home.createGathering')}</Button>}
          />
        </div>
      ) : (
        <div className="relative">
          {loading ? (
            <div className="flex gap-3 px-4 sm:px-5 pb-4 overflow-hidden">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-[155px] w-[258px] min-w-[258px] shrink-0" tone="cream" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <p className="px-4 sm:px-5 pb-4 text-sm text-ink-deep/55">{emptyLine}</p>
          ) : (
            <div
              ref={trackRef}
              className="flex gap-3 overflow-x-auto tt-no-scrollbar snap-x snap-mandatory px-4 sm:px-5 pb-4"
            >
              {cards.map(({ g, status, meta }) => (
                <div
                  key={g.id}
                  data-card
                  className="w-[258px] min-w-[258px] sm:w-[300px] shrink-0 snap-start"
                >
                  <GatheringCard
                    gathering={g}
                    dateLabel={status.label}
                    meta={meta}
                    role={roleOf(g.id)}
                    people={previews[g.id] || []}
                    to={`/gathering/${g.id}/journey`}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Explicit arrows for pointer devices; hidden on touch, where the
              strip is swiped directly. */}
          {!loading && cards.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => scrollStrip(-1)}
                aria-label={t('home.scrollPrev')}
                className="hidden [@media(hover:hover)]:flex absolute left-1.5 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-card/95 border border-ink-charcoal/25 text-ink-deep shadow-md hover:bg-cream-pale transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip(1)}
                aria-label={t('home.scrollNext')}
                className="hidden [@media(hover:hover)]:flex absolute right-1.5 top-1/2 -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-card/95 border border-ink-charcoal/25 text-ink-deep shadow-md hover:bg-cream-pale transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}