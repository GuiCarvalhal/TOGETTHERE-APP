import React from 'react';
import { Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

// Shared gathering metadata line — used by BOTH the Home gathering card and
// the internal gathering header (Agent/Journey/Expenses/Members), so the two
// surfaces always show identical metadata. Renders STRUCTURED data (never
// string parsing or dangerouslySetInnerHTML).
//
// EVENT mode (Main Event present):
//   Star (same canonical Star as the Main Event selector/timeline) + "when · address"
//   — start date+time (event's own tz) + full place address. No end/duration.
//   The Star is shrink-0 with an accessible label/title "Main Event"; the text
//   truncates with an ellipsis (full text in the container title attribute).
//
// NO EVENT mode:
//   "start – end · (N days)" — the date range truncates on narrow widths while
//   the separator + bold duration stay visible as a shrink-0 tail. The duration
//   is wrapped in <strong> (semantic bold). Never wraps or overflows.
//
// TBD/empty/partial: renders nothing (truthful empty — no fabricated text).
//
// `meta` = structured object from deriveGatheringMeta():
//   { mode: 'event', when, address }
//   { mode: 'range', rangeStart, rangeEnd, days, daysLabel }
//   { mode: 'tbd' }
export default function GatheringMetaLine({ meta, className = '' }) {
  const { t } = useI18n();
  if (!meta || meta.mode === 'tbd') return null;

  if (meta.mode === 'event') {
    const parts = [meta.when, meta.address].filter(Boolean);
    const fullText = parts.join(' · ');
    if (!fullText) return null;
    const mainEventLabel = t('journeyTypes.main_event');
    return (
      <div className={`flex items-center gap-1.5 min-w-0 ${className}`} title={fullText}>
        <span
          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-terra text-white shrink-0"
          title={mainEventLabel}
          aria-label={mainEventLabel}
          role="img"
        >
          <Star className="w-2.5 h-2.5" fill="currentColor" strokeWidth={1.5} />
        </span>
        <span className="truncate min-w-0">{fullText}</span>
      </div>
    );
  }

  // range mode
  const datePart = [meta.rangeStart, meta.rangeEnd].filter(Boolean).join(' – ');
  if (!datePart && !meta.daysLabel) return null;
  const fullText = meta.daysLabel ? `${datePart} · (${meta.daysLabel})` : datePart;
  return (
    <div className={`flex items-center min-w-0 ${className}`} title={fullText}>
      <span className="truncate min-w-0">{datePart}</span>
      {meta.daysLabel && (
        <span className="shrink-0 ml-1.5 whitespace-nowrap">
          <span className="opacity-50">·</span>{' '}
          <strong className="font-semibold">({meta.daysLabel})</strong>
        </span>
      )}
    </div>
  );
}