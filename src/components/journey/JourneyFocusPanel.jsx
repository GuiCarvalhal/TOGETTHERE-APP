import React from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock, Compass, Paperclip } from 'lucide-react';
import SegmentMap from '@/components/journey/SegmentMap';
import RouteDetailsCard from '@/components/journey/RouteDetailsCard';
import VenueInfoBlock from '@/components/journey/VenueInfoBlock';
import JourneyMapPanel from '@/components/journey/JourneyMapPanel';
import MemberAvatar from '@/components/tt/MemberAvatar';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { Image } from '@/components/ui/image';
import { Button } from '@/components/ui/button';
import { itemMapPoints } from '@/lib/journeyMap';
import { JOURNEY_TYPES } from '@/lib/gatheringHelpers';
import { journeyIcon } from '@/lib/journeyIcons';
import { formatFullDateTz, formatTimeWithCountry } from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { useI18n } from '@/lib/i18n';

const TYPE_COLOR = Object.fromEntries(JOURNEY_TYPES.map((x) => [x.key, x.color]));
const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Desktop-only contextual panel for the Journey page (right column, 2/3).
// It follows the existing map toggle instead of inventing a second map state:
//  - map ON  -> the whole route map with this journey's items/legs, tall.
//  - map OFF -> rich details of the segment selected in the left column
//               (when/times, places + the segment's own map, notes, people,
//               attachments) with a link to the full detail page.
//  - nothing selected -> a short, useful instruction.
// The segment map is only mounted for the ONE selected item, so selecting a
// card never fans out into per-item map/place calls.
export default function JourneyFocusPanel({ item, items, gatheringId, mapOpen, itemsPending, participants = [], to }) {
  const { t } = useI18n();
  const startTz = useItemStartTz(item);
  const endTz = useItemEndTz(item);
  const startCc = useItemStartCountry(item);
  const endCc = useItemEndCountry(item);

  if (mapOpen) {
    return (
      <div className="space-y-2">
        <JourneyMapPanel
          items={items}
          gatheringId={gatheringId}
          itemsPending={itemsPending}
          heightClass="h-[calc(100vh-14rem)] min-h-[320px]"
        />
        <p className="text-[11px] text-ink-deep/45 px-1">{t('journey.focusMapHint')}</p>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="tt-card p-10 text-center">
        <div className="w-12 h-12 rounded-2xl bg-terra/12 border border-terra/25 flex items-center justify-center mx-auto mb-3">
          <Compass className="w-6 h-6 text-terra-coral" />
        </div>
        <p className="font-display text-xl font-bold text-ink-deep">{t('journey.focusEmptyTitle')}</p>
        <p className="text-sm text-ink-deep/60 mt-1.5 max-w-sm mx-auto">{t('journey.focusEmptyBody')}</p>
      </div>
    );
  }

  const Icon = journeyIcon(item.type);
  const color = TYPE_COLOR[item.type] || TYPE_COLOR.other;
  const typeLabel = t('journeyTypes.' + item.type) || t('journeyTypes.other');
  const { origin, destination, point } = itemMapPoints(item);
  const query = item.location_name || item.location_to || item.location_from || '';
  const images = (item.attachments || []).filter(isImg);
  const docs = (item.attachments || []).filter((u) => !isImg(u));
  const start = item.start_datetime;
  const end = item.end_datetime;

  return (
    <div className="space-y-3">
      {/* Identity */}
      <div className="tt-card p-4 flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: `${color}1A`, color, border: `1px solid ${color}33` }}
        >
          <Icon className="w-6 h-6" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="tt-label" style={{ color }}>{typeLabel}</span>
          <h2 className="font-display text-2xl font-bold text-ink-deep leading-tight tt-text-balance">{item.title}</h2>
          {item.confirmation_number && (
            <p className="text-xs text-ink-deep/45 mt-1">{t('journeyDetail.confirmation', { code: item.confirmation_number })}</p>
          )}
        </div>
        {to && (
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link to={to}>{t('journey.focusOpenDetails')}</Link>
          </Button>
        )}
      </div>

      {/* When */}
      {(start || end) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.when')}</p>
          <div className={`grid gap-3 ${start && end ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {start && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-deep/40 mb-1">{t('journeyDetail.start')}</p>
                <p className="text-sm font-semibold text-ink-deep">{formatFullDateTz(start, startTz)}</p>
                <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeWithCountry(start, startTz, startCc)}</p>
              </div>
            )}
            {end && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-ink-deep/40 mb-1">{t('journeyDetail.end')}</p>
                <p className="text-sm font-semibold text-ink-deep">{formatFullDateTz(end, endTz)}</p>
                <p className="text-xs text-ink-deep/55 flex items-center gap-1"><Clock className="w-3 h-3" />{formatTimeWithCountry(end, endTz, endCc)}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Where + this segment's own map */}
      {(item.location_from || item.location_to || item.location_name) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.where')}</p>
          <div className="space-y-2 text-sm text-ink-deep">
            {item.location_from && item.location_to && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_from} → {item.location_to}</span></p>
            )}
            {item.location_from && !item.location_to && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_from}</span></p>
            )}
            {item.location_to && !item.location_from && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_to}</span></p>
            )}
            {item.location_name && (
              <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-terra-coral shrink-0" /><span className="truncate">{item.location_name}</span></p>
            )}
          </div>
          <div className="mt-3">
            <SegmentMap key={item.id} origin={origin} destination={destination} point={point} query={query} isFlight={item.type === 'flight'} />
          </div>
          {(item.type === 'car' || item.type === 'train') && item.location_from && item.location_to && (
            <RouteDetailsCard origin={item.location_from} destination={item.location_to} />
          )}
          {(item.type === 'hotel' || item.type === 'activity') && item.location_name && (
            <VenueInfoBlock query={item.location_name} />
          )}
        </div>
      )}

      {/* Notes */}
      {item.notes && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2">{t('journeyDetail.notes')}</p>
          <p className="text-sm text-ink-deep/80 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
        </div>
      )}

      {/* People */}
      <div className="tt-card p-4">
        <div className="flex items-center justify-between mb-2.5">
          <p className="tt-label text-ink-deep/40">{t('journeyDetail.people')}</p>
          {participants.length > 0 && <span className="text-xs text-ink-deep/45">{t('journeyDetail.onSegment', { count: participants.length })}</span>}
        </div>
        {participants.length > 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            {participants.map((m) => (
              <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full bg-cream-pale border border-ink-charcoal/10 pl-0.5 pr-2.5 py-0.5">
                <MemberAvatar member={m} size="xs" />
                <span className="text-xs font-semibold text-ink-deep/75 max-w-[9rem] truncate">{m.full_name || m.email}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-deep/50">{t('journeyDetail.noOneJoined')}</p>
        )}
      </div>

      {/* Attachments */}
      {(images.length > 0 || docs.length > 0) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5 flex items-center gap-1.5">
            <Paperclip className="w-3 h-3" />{t('journeyDetail.attachments')}
          </p>
          {images.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              {images.slice(0, 6).map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-[4/3] rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                  <Image src={url} alt={t('journeyDetail.attachmentAlt', { n: i + 1 })} className="w-full h-full" fittingType="fill" />
                </a>
              ))}
            </div>
          )}
          {docs.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {docs.map((url, i) => <AttachmentChip key={url + i} url={url} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}