import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, ArrowUpRight } from 'lucide-react';
import SegmentMap from '@/components/journey/SegmentMap';
import { Button } from '@/components/ui/button';
import { itemMapPoints } from '@/lib/journeyMap';
import { useI18n } from '@/lib/i18n';

// Desktop-only companion to a journey card (right column, map OFF). The card in
// the left column stays the primary source: this extension carries ONLY what
// does not fit there — the segment's own mini map, its notes, and the link to
// the full detail page. Every extension uses the same fixed height so the
// column reads as one aligned set while the list scrolls.
export default function JourneyExtensionCard({ item, gatheringId }) {
  const { t } = useI18n();
  const { origin, destination, point } = itemMapPoints(item);
  const query = item.location_name || item.location_to || item.location_from || '';
  const hasMap = !!((origin?.lat != null && destination?.lat != null) || point?.lat != null || query);
  const to = `/gathering/${gatheringId}/journey/${item.id}`;

  return (
    <div className="tt-card p-2.5 h-[10.75rem] flex gap-3 overflow-hidden">
      <div className="w-[38%] max-w-[240px] shrink-0 rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
        {hasMap ? (
          <SegmentMap
            key={item.id}
            origin={origin}
            destination={destination}
            point={point}
            query={query}
            isFlight={item.type === 'flight'}
            heightClass="h-full"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-2">
            <MapPin className="w-4 h-4 text-terra/40 mb-1" />
            <p className="text-[11px] text-ink-deep/45 leading-tight">{t('journey.extNoMap')}</p>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-deep/40 truncate">
          {t('journeyTypes.' + item.type) || t('journeyTypes.other')}
        </p>
        <p className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{item.title}</p>
        <p className={`text-xs mt-1 leading-relaxed whitespace-pre-wrap line-clamp-3 ${item.notes ? 'text-ink-deep/70' : 'text-ink-deep/35 italic'}`}>
          {item.notes || t('journey.extNoNotes')}
        </p>
        <div className="mt-auto pt-1.5">
          <Button asChild size="sm" variant="outline" className="h-7 px-2.5 text-[11px]">
            <Link to={to}>
              {t('journey.extFullDetails')}
              <ArrowUpRight className="w-3 h-3" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}