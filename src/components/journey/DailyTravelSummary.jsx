import React from 'react';
import { Car, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDistanceMeters, formatDurationSeconds } from '@/lib/journeyDistance';

// One-line per-day travel summary shown under the Timeline day header: the
// total driving distance + duration between that day's consecutive segments.
// States: loading (spinner), unavailable (no leg could be routed), partial
// (some legs unknown — prefixed with ~ and tagged), ready (all legs routed).
// Hidden when the day has no inter-segment legs or when the routed total is
// zero (all same-place). Aligned to the timeline content column (ml-12).
export default function DailyTravelSummary({ total, loading }) {
  const { t, locale } = useI18n();
  if (loading) {
    return (
      <div className="ml-12 mb-1.5 flex items-center gap-1.5 text-[0.7rem] text-ink-deep/50">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>{t('journey.dailyCalculating')}</span>
      </div>
    );
  }
  if (!total || total.state === 'none') return null;
  if (total.state === 'unavailable') {
    return (
      <div className="ml-12 mb-1.5 flex items-center gap-1.5 text-[0.7rem] text-ink-deep/40">
        <Car className="w-3 h-3" />
        <span>{t('journey.dailyUnavailable')}</span>
      </div>
    );
  }
  if (total.distanceMeters === 0 && total.durationSeconds === 0) return null;
  const dist = formatDistanceMeters(total.distanceMeters, locale);
  const dur = formatDurationSeconds(total.durationSeconds);
  const partial = total.state === 'partial';
  return (
    <div
      className="ml-12 mb-1.5 flex items-center gap-1.5 text-[0.7rem] text-ink-deep/55"
      title={partial ? t('journey.dailyPartialHint') : undefined}
    >
      <Car className="w-3 h-3 text-terra-deep" />
      <span className="font-semibold text-ink-deep/70">
        {partial ? '~' : ''}{dist} · {dur}
      </span>
      {partial && <span className="text-ink-deep/40">({t('journey.dailyPartial')})</span>}
    </div>
  );
}