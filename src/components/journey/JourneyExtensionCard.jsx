import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Pencil } from 'lucide-react';
import SegmentMap from '@/components/journey/SegmentMap';
import JourneyExtensionInfo from '@/components/journey/JourneyExtensionInfo';
import { Button } from '@/components/ui/button';
import { itemMapPoints } from '@/lib/journeyMap';
import { useI18n } from '@/lib/i18n';

// Desktop companion to a journey card (map OFF). It sits in the SAME grid row as
// its card, so it fills the shared row height (h-full) and its top/bottom edges
// line up 1:1 with the card. The left card stays the summary; this is the
// expanded, practical view of the same segment — mini map plus the detail
// content (when / where / who / notes / attachments) and the edit action.
export default function JourneyExtensionCard({ item, gatheringId, attendees = [], canEdit = false }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { origin, destination, point } = itemMapPoints(item);
  const query = item.location_name || item.location_to || item.location_from || '';
  const hasMap = !!((origin?.lat != null && destination?.lat != null) || point?.lat != null || query);
  const base = `/gathering/${gatheringId}/journey/${item.id}`;

  // Opens the edit flow directly: flights edit on the full-page flight surface,
  // every other type on the detail page with its edit form already open.
  const onEdit = () => navigate(item.type === 'flight' ? `${base}/edit` : `${base}?edit=1`);

  return (
    <div className="tt-card p-2.5 h-full min-h-[10.5rem] flex gap-3 overflow-hidden">
      <div className="w-[34%] max-w-[220px] shrink-0 rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
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
        <div className="shrink-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-deep/40 truncate">
            {t('journeyTypes.' + item.type) || t('journeyTypes.other')}
            {item.confirmation_number && <span className="text-ink-deep/30 normal-case tracking-normal"> · #{item.confirmation_number}</span>}
          </p>
          <p className="font-display text-sm font-bold text-ink-deep leading-tight truncate">{item.title}</p>
        </div>

        <div className="mt-1 min-h-0 flex-1 overflow-y-auto">
          <JourneyExtensionInfo item={item} attendees={attendees} />
        </div>

        {canEdit && (
          <div className="mt-1.5 pt-1.5 border-t border-ink-charcoal/10 shrink-0">
            <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" onClick={onEdit}>
              <Pencil className="w-3 h-3" />
              {t('journey.extEdit')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}