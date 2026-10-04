import React from 'react';
import { Image } from '@/components/ui/image';
import { useI18n } from '@/lib/i18n';
import { itemMapPoints } from '@/lib/journeyMap';
import AttachmentChip from '@/components/tt/AttachmentChip';
import AvatarStack from '@/components/tt/AvatarStack';
import SegmentMap from '@/components/journey/SegmentMap';
import FlightStatusCard from '@/components/journey/FlightStatusCard';
import FlightDetailHeader from '@/components/journey/FlightDetailHeader';
import JoinSegmentButton from '@/components/journey/JoinSegmentButton';
import SegmentInfoSections from '@/components/journey/SegmentInfoSections';

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Flight-specific detail layout (rendered by JourneyDetail when the item is a
// flight). Non-flight details keep the existing JourneyDetail layout. This
// view: compact flight header card (reuses Journey card data), flight status
// as primary, map-only Where (no redundant text labels), and a compact People
// panel with inline Join/Leave. No "When" section (redundant with flight
// status). No "More Flight Details" expandable (removed from FlightStatusCard).
export default function FlightDetailView({ item, members, currentMember, onReload }) {
  const { t } = useI18n();
  const memberById = Object.fromEntries(members.map((m) => [m.user_id, m]));
  const attendees = (item.attendee_user_ids || []).map((uid) => memberById[uid]).filter(Boolean);
  const { origin, destination, point } = itemMapPoints(item);
  const images = (item.attachments || []).filter(isImg);
  const docs = (item.attachments || []).filter((u) => !isImg(u));

  return (
    <div className="mt-4 space-y-4">
      <FlightDetailHeader item={item} />

      {item.confirmation_number && (
        <FlightStatusCard
          flightNumber={item.confirmation_number}
          date={item.start_datetime ? item.start_datetime.slice(0, 10) : ''}
          originTimezone={item.from_place?.tz}
          destinationTimezone={item.to_place?.tz}
        />
      )}

      {/* Where — map only, no redundant text labels around the route */}
      {(origin || destination || point) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.where')}</p>
          <SegmentMap key={item.id} origin={origin} destination={destination} point={point} isFlight />
        </div>
      )}

      {/* People — avatar row + compact Join/Leave on the right */}
      <div className="tt-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="tt-label text-ink-deep/40 mb-2">{t('journeyDetail.people')}</p>
            {attendees.length > 0 ? (
              <AvatarStack people={attendees} max={8} size="sm" />
            ) : (
              <p className="text-sm text-ink-deep/50">{t('journeyDetail.noOneJoinedFlight')}</p>
            )}
          </div>
          <div className="shrink-0">
            <JoinSegmentButton item={item} currentMember={currentMember} onJoined={onReload} compact />
          </div>
        </div>
      </div>

      {/* Notes */}
      {item.notes && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2">{t('journeyDetail.notes')}</p>
          <p className="text-sm text-ink-deep/80 whitespace-pre-wrap leading-relaxed">{item.notes}</p>
        </div>
      )}

      <SegmentInfoSections item={item} currentMember={currentMember} members={members} />

      {/* Attachments */}
      {(images.length > 0 || docs.length > 0) && (
        <div className="tt-card p-4">
          <p className="tt-label text-ink-deep/40 mb-2.5">{t('journeyDetail.attachments')}</p>
          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              {images.map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-xl overflow-hidden border border-ink-charcoal/10 bg-cream-pale">
                  <Image src={url} alt={t('journeyDetail.attachmentAlt', { n: i + 1 })} className="w-full h-full object-cover" fittingType="fill" />
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