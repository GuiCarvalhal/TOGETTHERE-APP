import React from 'react';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { formatFullDateTz, formatTimeWithCountry } from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { useI18n } from '@/lib/i18n';

function firstNameOf(person) {
  const name = person?.full_name || person?.email || '';
  return name.split(' ')[0] || '?';
}

// Body of the desktop extra card: when, who and notes. The type and the
// address are deliberately absent — the type repeats the card's own badge and
// the address is already on the mini map above this block. Everything here is
// clamped inside the card's fixed row height, so long notes or many people can
// never push the row taller than its left card.
export default function JourneyExtensionInfo({ item, attendees = [], leg = null }) {
  const { t } = useI18n();
  const startTz = useItemStartTz(item);
  const endTz = useItemEndTz(item);
  const startCc = useItemStartCountry(item);
  const endCc = useItemEndCountry(item);

  // Check-out leg: lean content only — the check-out moment. The stay's map,
  // full date range, people and notes already live on the check-in extension
  // of the very same record, so repeating them here would be pure noise.
  if (leg === 'check-out') {
    return (
      <div className="space-y-1.5">
        {item.end_datetime && (
          <p className="text-[11px] text-ink-deep/70 leading-snug">
            <span className="tt-label text-ink-deep/35 mr-1.5">{t('journeyDetail.checkOut')}</span>
            {formatFullDateTz(item.end_datetime, endTz)} · {formatTimeWithCountry(item.end_datetime, endTz, endCc)}
          </p>
        )}
      </div>
    );
  }

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

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <span className="tt-label text-ink-deep/35 shrink-0">{t('journeyDetail.people')}</span>
        {attendees.length > 0
          ? attendees.map((p, i) => (
            <span key={p.user_id || p.email || i} className="inline-flex items-center gap-1 min-w-0 max-w-[7.5rem]">
              <MemberAvatar member={p} size="xs" />
              <span className="text-[11px] text-ink-deep/70 truncate">{firstNameOf(p)}</span>
            </span>
          ))
          : <span className="text-[11px] text-ink-deep/40 truncate">{t('journeyDetail.noOneJoined')}</span>}
      </div>

      {item.notes && (
        <p className="text-[11px] text-ink-deep/65 leading-relaxed whitespace-pre-wrap line-clamp-2 overflow-hidden">{item.notes}</p>
      )}
    </div>
  );
}