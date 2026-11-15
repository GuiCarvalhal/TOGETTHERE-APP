import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import JourneyCard from '@/components/tt/cards/JourneyCard';
import { journeyIcon } from '@/lib/journeyIcons';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((t) => [t.key, t.color]));

// "Caixa" = Home's large thematic card. This one is the now/next gathering: the
// trip that matters right now, with its upcoming itinerary items as a horizontal
// carousel inside the card — one immersive surface instead of a grid of small
// tiles, and readable at phone width.
export default function NowNextCaixa({ annotation, items = [], people = [], ongoing = false }) {
  const { t } = useI18n();
  if (!annotation?.g) return null;
  const { g, status, meta } = annotation;

  return (
    <section className="tt-card-hairline overflow-hidden">
      <div className="flex items-start gap-3 p-4 sm:p-5 border-b border-ink-charcoal/10">
        <div className="min-w-0 flex-1">
          <p className="tt-label text-terra-coral">{ongoing ? t('home.happeningNow') : t('home.upNext')}</p>
          <p className="font-display text-xl font-bold text-ink-deep leading-tight truncate mt-0.5">{g.name}</p>
          <p className="text-xs text-ink-deep/55 truncate mt-1">
            {[status?.label, meta].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Link
          to={`/gathering/${g.id}/journey`}
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-terra/10 text-terra-deep px-3 h-9 text-xs font-semibold hover:bg-terra/15 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('home.openGathering')}
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="p-3 sm:p-4">
        <p className="tt-label text-ink-deep/40 px-1 pb-2">{t('home.caixaUpcoming')}</p>
        {items.length ? (
          <div className="flex gap-3 overflow-x-auto tt-no-scrollbar snap-x snap-mandatory -mx-1 px-1 pb-1">
            {items.map((item) => (
              <div key={item.id} className="w-[258px] min-w-[258px] shrink-0 snap-start">
                <JourneyCard
                  item={item}
                  typeColor={TYPE_COLOR[item.type] || TYPE_COLOR.other}
                  icon={journeyIcon(item.type)}
                  participants={people}
                  showImages
                  embedded
                  to={`/gathering/${g.id}/journey/${item.id}`}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-deep/50 px-1 pb-1">{t('home.caixaNoItems')}</p>
        )}
      </div>
    </section>
  );
}