import React from 'react';
import { MapPin, Paperclip } from 'lucide-react';
import AvatarStack from '@/components/tt/AvatarStack';
import AttachmentChip from '@/components/tt/AttachmentChip';
import { formatFullDateTz, formatTimeWithCountry } from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { useI18n } from '@/lib/i18n';

// The practical part of the segment detail, compacted into the desktop extra
// card: when, where, who, notes and attachments — the same information the
// detail page shows, minus the blocks that need their own live lookup (live
// flight status, routed distance, venue profile).
export default function JourneyExtensionInfo({ item, attendees = [] }) {
  const { t } = useI18n();
  const startTz = useItemStartTz(item);
  const endTz = useItemEndTz(item);
  const startCc = useItemStartCountry(item);
  const endCc = useItemEndCountry(item);
  const attachments = item.attachments || [];
  const route = item.location_from && item.location_to
    ? `${item.location_from} → ${item.location_to}`
    : (item.location_from || item.location_to || '');
  const place = [route, item.location_name].filter(Boolean);

  return (
    <div className="space-y-1.5">
      {(item.start_datetime || item.end_datetime) && (
        <p className="text-[11px] text-ink-deep/70 leading-snug">
          <span className="tt-label text-ink-deep/35 mr-1.5">{t('journeyDetail.when')}</span>
          {item.start_datetime && <>{formatFullDateTz(item.start_datetime, startTz)} · {formatTimeWithCountry(item.start_datetime, startTz, startCc)}</>}
          {item.start_datetime && item.end_datetime && <span className="text-ink-deep/30"> → </span>}
          {item.end_datetime && <>{formatFullDateTz(item.end_datetime, endTz)} · {formatTimeWithCountry(item.end_datetime, endTz, endCc)}</>}
        </p>
      )}

      {place.length > 0 && (
        <p className="text-[11px] text-ink-deep/70 leading-snug flex items-start gap-1">
          <MapPin className="w-3 h-3 mt-0.5 text-terra-coral shrink-0" />
          <span className="min-w-0 truncate">{place.join(' · ')}</span>
        </p>
      )}

      <div className="flex items-center gap-1.5 min-w-0">
        <span className="tt-label text-ink-deep/35 shrink-0">{t('journeyDetail.people')}</span>
        {attendees.length > 0
          ? <AvatarStack people={attendees} max={5} size="xs" />
          : <span className="text-[11px] text-ink-deep/40 truncate">{t('journeyDetail.noOneJoined')}</span>}
        {attachments.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-deep/45 shrink-0">
            <Paperclip className="w-3 h-3" />{attachments.length}
          </span>
        )}
      </div>

      {item.notes && (
        <p className="text-[11px] text-ink-deep/65 leading-relaxed whitespace-pre-wrap line-clamp-2">{item.notes}</p>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {attachments.slice(0, 2).map((url, i) => <AttachmentChip key={url + i} url={url} />)}
        </div>
      )}
    </div>
  );
}