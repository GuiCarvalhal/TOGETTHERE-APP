import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, CalendarDays } from 'lucide-react';
import { Image } from '@/components/ui/image';
import { useI18n } from '@/lib/i18n';

// Past gatherings stay reachable but compact: a single hairline row per trip
// (thumbnail, name, date) instead of another full card in the grid. This keeps
// the caixas the visual focus while old trips remain one tap away.
export default function PastGatheringRow({ gathering, dateLabel, last = false }) {
  const { t } = useI18n();
  const cover = gathering?.cover_image;

  return (
    <Link
      to={`/gathering/${gathering.id}/journey`}
      className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        last ? '' : 'border-b border-ink-charcoal/10'
      }`}
    >
      <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 bg-cream-pale border border-ink-charcoal/10 grid place-items-center">
        {cover ? (
          <Image src={cover} alt="" className="w-full h-full object-cover" fittingType="fill" />
        ) : (
          <CalendarDays className="w-4 h-4 text-ink-deep/35" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-deep leading-tight truncate">
          {gathering.name || t('common.untitled')}
        </p>
        <p className="text-[0.6875rem] text-ink-deep/50 truncate mt-0.5">{dateLabel || ''}</p>
      </div>
      <ChevronRight className="w-4 h-4 shrink-0 text-ink-deep/30" />
    </Link>
  );
}