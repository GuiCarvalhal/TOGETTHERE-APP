import React from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Plane, Clock, MapPin, Navigation, UtensilsCrossed, Luggage, ChevronRight,
} from 'lucide-react';
import { differenceInCalendarDays } from 'date-fns';
import { useI18n } from '@/lib/i18n';
import { useDistanceUnit } from '@/lib/distanceUnit';
import { nextBriefTips, haversineMeters } from '@/lib/nextBriefTips';
import { formatDistanceMeters } from '@/lib/journeyDistance';

// "Next / Now" AI Agent brief — the top-priority info hub on Home, rendered
// directly under the featured journey card and above the gatherings list.
// Exactly 3 action-oriented tips for the item Home already flagged as the
// user's current/next segment; nothing is fetched here, so the card paints with
// the Home payload (no extra latency, no external dependency).
const TIP_ICONS = {
  gate: Plane,
  airport: Clock,
  landing: MapPin,
  depart: Clock,
  route: Navigation,
  dropoff: MapPin,
  timing: Clock,
  nearby: UtensilsCrossed,
  prep: Luggage,
};

export default function NextBriefCard({ next }) {
  const { t, locale } = useI18n();
  const { unit } = useDistanceUnit();
  const item = next?.item;
  if (!item) return null;

  const now = new Date();
  const start = item.start_datetime ? new Date(item.start_datetime) : null;
  const startTime = start
    ? start.toLocaleTimeString(locale === 'pt-BR' ? 'pt-BR' : 'en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  const days = start ? differenceInCalendarDays(start, now) : 0;
  const whenLabel = next.ongoing
    ? t('home.today')
    : days <= 0 ? t('home.today') : days === 1 ? t('home.tomorrow') : t('home.inDays', { count: days });

  const meters = haversineMeters(item.from_place, item.to_place);
  const tips = nextBriefTips(item, {
    time: startTime,
    distanceLabel: meters != null ? formatDistanceMeters(meters, unit) : '',
  });

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
      <div className="tt-card-hairline p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="tt-label text-terra-coral inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {t('home.brief.label')}
          </p>
          <span className="tt-stamp border-terra/25 bg-terra/10 text-terra-deep">
            {next.ongoing ? t('home.happeningNow') : t('home.upNext')}
          </span>
        </div>

        <Link
          to={`/gathering/${next.gatheringId}/journey/${item.id}`}
          className="mt-2 flex items-start gap-2 min-w-0 group"
        >
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg sm:text-xl font-bold text-ink-deep leading-tight truncate">
              {item.title || t('common.untitled')}
            </h3>
            <p className="text-xs text-ink-deep/60 mt-0.5">
              {[whenLabel, startTime].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-deep/35 shrink-0 mt-1 group-hover:text-terra-deep" />
        </Link>

        <ul className="mt-4 space-y-3">
          {tips.map((tip) => {
            const Icon = TIP_ICONS[tip.id] || Sparkles;
            return (
              <li key={tip.id} className="flex items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-terra/10 border border-terra/20 grid place-items-center shrink-0">
                  <Icon className="w-4 h-4 text-terra-deep" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-ink-deep leading-tight">
                    {t(tip.titleKey, tip.vars)}
                  </p>
                  <p className="text-xs text-ink-deep/65 leading-snug mt-0.5">
                    {t(tip.detailKey, tip.vars)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}