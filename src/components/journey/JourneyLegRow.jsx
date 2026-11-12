import React from 'react';
import { Route as RouteIcon, ExternalLink } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDistanceMeters, formatDurationSeconds } from '@/lib/journeyDistance';
import { useDistanceUnit } from '@/lib/distanceUnit';

// The travel line BETWEEN two consecutive timeline cards: the real displacement
// from the previous segment to the next one ("24 mi · 52 min"), replacing the
// old day-header aggregate.
//
// Layout mirrors the cards (w-12 gutter + content) so the row lines up with the
// card content column, and the route icon sits at the START of that content
// column — outside the vertical timeline rail, never on top of it.
//
// The whole line is a link to Google Maps directions between the two items,
// built from the exact routable endpoints the distance was measured on (that is
// what the leg carries: "lat,lng" when coordinates exist, else the address or
// place name). Renders nothing when an endpoint is missing or the two items sit
// in the same place — there is no travel to describe.
export default function JourneyLegRow({ leg, fromLabel = '', toLabel = '', className = '' }) {
  const { t } = useI18n();
  const { unit } = useDistanceUnit();
  if (!leg || !leg.origin || !leg.destination) return null;
  if (leg.state === 'same') return null;
  // The batch has not resolved yet: show nothing rather than a placeholder that
  // would turn into a number a moment later.
  if (!leg.state) return null;

  const measured = leg.state === 'ok';
  const label = measured
    ? `${formatDistanceMeters(leg.distanceMeters, unit)} · ${formatDurationSeconds(leg.durationSeconds)}`
    : t('journey.legRoute');

  const mapsUrl = 'https://www.google.com/maps/dir/?api=1'
    + `&origin=${encodeURIComponent(leg.origin)}`
    + `&destination=${encodeURIComponent(leg.destination)}`
    + '&travelmode=driving';

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t('journey.legRouteAria', {
        from: fromLabel || leg.origin,
        to: toLabel || leg.destination,
      })}
      className={`group flex gap-2 items-center rounded-xl py-1 text-[0.7rem] transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terra/40 ${className}`}
    >
      {/* Rail gutter — keeps the row's content aligned with the cards. */}
      <div className="w-12 shrink-0" aria-hidden />
      <span className="min-w-0 inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full">
        <RouteIcon className="w-3.5 h-3.5 shrink-0 text-terra-deep" />
        <span className={`truncate ${measured ? 'font-semibold text-ink-deep/65' : 'text-ink-deep/45'}`}>{label}</span>
        <ExternalLink className="w-3 h-3 shrink-0 text-ink-deep/25 group-hover:text-terra-deep" />
      </span>
    </a>
  );
}