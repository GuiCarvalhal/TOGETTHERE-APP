import React, { useRef } from 'react';
import {
  Plus, ChevronLeft, ChevronRight, Compass, RotateCw, CalendarDays, Clock, MapPin, Users, ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import Skeleton from '@/components/tt/Skeleton';
import EmptyState from '@/components/tt/EmptyState';
import GatheringCard from '@/components/tt/cards/GatheringCard';
import { useI18n } from '@/lib/i18n';

// BOX B — the dedicated Gatherings box, separate from the NOW/NEXT item box
// above it. It owns everything trip-list shaped, in this order:
//   1. header ("Your gatherings") with the New action inside the box
//   2. the Upcoming / Past switch
//   3. the gatherings as cards in a horizontal carousel — native swipe on touch,
//      explicit overlay arrows only where a hover pointer exists
//   4. a short, data-derived summary of the gatherings context (3–5 bullets)
export default function GatheringsCaixa({
  loading,
  loadError,
  onRetry,
  upcoming = [],
  past = [],
  filter,
  onFilterChange,
  roleOf,
  previews = {},
  totalCount = 0,
  onNew,
}) {
  const { t } = useI18n();
  const trackRef = useRef(null);

  const cards = filter === 'past' ? past : upcoming;

  function scrollStrip(dir) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('[data-card]');
    const step = card ? card.getBoundingClientRect().width + 12 : Math.round(el.clientWidth * 0.85);
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  // Summary: straight from the data already on screen — counts, the next and
  // last trip, how many people travel with you, how many places are involved.
  const bullets = [];
  if (totalCount > 0) {
    bullets.push({
      id: 'counts',
      icon: CalendarDays,
      text: t('home.summaryCounts', { upcoming: upcoming.length, past: past.length }),
    });
  }
  const nextTrip = upcoming[0];
  if (nextTrip) {
    bullets.push({
      id: 'next',
      icon: Clock,
      text: nextTrip.status?.key === 'ongoing'
        ? t('home.summaryOngoing', { name: nextTrip.g.name || t('common.untitled') })
        : t('home.summaryNext', { name: nextTrip.g.name || t('common.untitled'), when: nextTrip.status?.label || '' }),
    });
  }
  const lastTrip = past[0];
  if (lastTrip) {
    bullets.push({
      id: 'last',
      icon: ArrowUpRight,
      text: t('home.summaryLast', { name: lastTrip.g.name || t('common.untitled'), when: lastTrip.status?.label || '' }),
    });
  }
  const people = new Set();
  Object.values(previews).forEach((list) => (list || []).forEach((p) => people.add(p.id || p.email || p.name)));
  if (people.size) {
    bullets.push({ id: 'people', icon: Users, text: t('home.summaryPeople', { count: people.size }) });
  }
  const places = new Set();
  [...upcoming, ...past].forEach(({ g }) => {
    (g.destinations || []).forEach((d) => d && places.add(String(d).trim().toLowerCase()));
    (g.destination_places || []).forEach((d) => d?.name && places.add(String(d.name).trim().toLowerCase()));
  });
  if (places.size) {
    bullets.push({ id: 'places', icon: MapPin, text: t('home.summaryPlaces', { count: places.size }) });
  }
  const summary = bullets.slice(0, 5);

  const emptyLine = filter === 'past' ? t('home.noPast') : t('home.noUpcoming');

  return (
    <section className="tt-card-hairline overflow-hidden">
      {/* 1 — header + New action, inside the box */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4 pb-3">
        <p className="tt-label text-terra-coral min-w-0 truncate">{t('home.yourGatherings')}</p>
        <Button onClick={onNew} size="sm" className="shrink-0">
          <Plus /> {t('home.new')}
        </Button>
      </div>

      {/* 2 — Upcoming / Past switch */}
      <div className="px-4 sm:px-5 pb-2.5">
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

      {/* 3 — carousel */}
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
                  className="w-[258px] min-w-[258px] sm:w-[300px] shrink-0 snap-start flex"
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

          {/* Explicit overlay arrows for pointer devices only: on touch the strip
              is swiped directly. */}
          {!loading && cards.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => scrollStrip(-1)}
                aria-label={t('home.scrollPrev')}
                className="hidden [@media(hover:hover)]:flex absolute left-1.5 top-[calc(50%-8px)] -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-card/95 border border-ink-charcoal/25 text-ink-deep shadow-md hover:bg-cream-pale transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollStrip(1)}
                aria-label={t('home.scrollNext')}
                className="hidden [@media(hover:hover)]:flex absolute right-1.5 top-[calc(50%-8px)] -translate-y-1/2 z-10 h-9 w-9 items-center justify-center rounded-full bg-card/95 border border-ink-charcoal/25 text-ink-deep shadow-md hover:bg-cream-pale transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      {/* 4 — gatherings summary */}
      {!loading && summary.length > 0 && (
        <div className="bg-card border-t border-ink-charcoal/10 px-4 sm:px-5 py-3">
          <ul className="space-y-1.5">
            {summary.map((b) => {
              const Icon = b.icon;
              return (
                <li key={b.id} className="flex items-start gap-2">
                  <Icon className="w-3.5 h-3.5 mt-[3px] shrink-0 text-terra-deep" aria-hidden="true" />
                  <span className="text-xs sm:text-[0.8125rem] leading-snug text-ink-deep/80 min-w-0">{b.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}