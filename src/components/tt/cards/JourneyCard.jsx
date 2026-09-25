import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, ChevronRight, Clock, CalendarDays } from 'lucide-react';
import { Image } from '@/components/ui/image';
import MemberAvatar from '@/components/tt/MemberAvatar';
import {
  formatTimeTz, formatDateTz, startLocation, endLocation,
  formatDuration, isAllDayItem, journeyMeta,
} from '@/lib/formatPlaceTime';
import { usePlaceTimezone } from '@/lib/usePlaceTimezone';
import { usePlacePhoto } from '@/lib/usePlacePhoto';

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Timeline journey segment row. The left rail column (icon medallion + start
// time) is kept separate from the card and aligns to the vertical rail. Both
// the medallion and the time block carry a fully opaque page-surface
// background (bg-background, no alpha) so the rail line never shows through
// them — it reads as clean segments between nodes, in light and dark mode.
//
// The card body starts with the metadata line (no item-type label line — the
// rail icon already conveys the type), then the title, then timing, then the
// actual participants of this item (attendee_user_ids, or the creator as a
// fallback, never all gathering members).
//
// Images ON  → selected image as a full-card cover with a dark gradient scrim.
// Images OFF → a clean white card with no image.
export default function JourneyCard({ item, typeColor, icon: Icon, participants, showImages, to }) {
  const navigate = useNavigate();
  const startTz = usePlaceTimezone(startLocation(item));
  const endTz = usePlaceTimezone(endLocation(item));
  const placePhoto = usePlacePhoto(item);
  const imageAtt = (item.attachments || []).find(isImg);
  const cover = showImages ? (imageAtt || placePhoto) : null;
  const onCover = !!cover;

  const allDay = isAllDayItem(item, startTz);
  const startTime = allDay ? '' : formatTimeTz(item.start_datetime, startTz);
  const endTime = (!allDay && item.end_datetime) ? formatTimeTz(item.end_datetime, endTz) : '';
  const duration = (!allDay && item.start_datetime && item.end_datetime) ? formatDuration(item.start_datetime, item.end_datetime) : '';
  const meta = journeyMeta(item);

  // Split the start time into wall-clock + tz abbreviation for the narrow rail.
  const timePart = startTime ? startTime.split(' (')[0] : '';
  const abbr = (startTime.match(/\(([^)]+)\)/) || [])[1] || '';

  const open = () => { if (to) navigate(to); };

  const mainText = onCover ? 'text-white' : 'text-ink-deep';
  const subText = onCover ? 'text-white/85' : 'text-ink-deep/55';
  const metaText = onCover ? 'text-white/80' : 'text-ink-deep/50';
  const dividerClass = onCover ? 'border-white/20' : 'border-ink-charcoal/10';

  const hasParticipants = participants?.length > 0;
  const hasAttachments = (item.attachments || []).length > 0;

  return (
    <div
      className="flex gap-2 items-stretch cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      role="link"
      tabIndex={to ? 0 : undefined}
      onClick={open}
      onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
    >
      {/* Left rail column: icon medallion + start time. Both have an opaque
          page-surface background so the rail line is interrupted by them. */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 bg-background border-2"
          style={{ color: typeColor, borderColor: typeColor }}
        >
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {allDay ? (
          <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded">
            <p className="text-[0.625rem] font-bold text-foreground/70 whitespace-nowrap">All day</p>
          </div>
        ) : timePart ? (
          <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded">
            <p className="text-xs font-bold text-foreground whitespace-nowrap">{timePart}</p>
            {abbr && <p className="text-[0.625rem] text-foreground/45 mt-0.5">{abbr}</p>}
          </div>
        ) : null}
      </div>

      {/* Card */}
      <div className={`flex-1 min-w-0 rounded-2xl overflow-hidden relative ${onCover ? '' : 'tt-card'}`}>
        {onCover && (
          <>
            <Image src={cover} alt="" className="absolute inset-0 w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-deep/90 via-ink-deep/60 to-ink-deep/35" />
          </>
        )}
        <div className="relative p-3 min-h-[68px] flex flex-col">
          <ChevronRight className="absolute top-3 right-3 w-4 h-4 shrink-0" style={{ color: onCover ? 'rgba(255,255,255,0.75)' : undefined }} />

          {/* Metadata line — the first line of the card (no item-type label) */}
          {meta && <p className={`text-[0.6875rem] truncate pr-5 ${metaText}`}>{meta}</p>}

          <h3 className={`font-display text-[0.95rem] font-bold leading-tight mt-0.5 line-clamp-2 pr-5 ${mainText}`}>{item.title}</h3>

          {/* Timing: start → end · duration, in local tz; all-day state otherwise */}
          <div className={`flex items-center gap-1.5 mt-1 text-xs flex-wrap ${subText}`}>
            {allDay ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatDateTz(item.start_datetime, startTz) ? `${formatDateTz(item.start_datetime, startTz)} · All day` : 'All day'}
              </span>
            ) : (
              <>
                {startTime && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{startTime}</span>}
                {endTime && <><span className="opacity-50">→</span><span>{endTime}</span></>}
                {duration && (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold ${onCover ? 'bg-white/20 text-white' : 'bg-cream-pale text-ink-deep/60 border border-ink-charcoal/10'}`}>
                    {duration}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Actual participants of this item + attachments. Never falls back
              to all gathering members — shows the creator when no one opted in,
              or an honest "No one joined yet" when even the creator isn't
              resolvable. +N reflects real participants only. */}
          <div className={`flex items-center gap-2 mt-2 pt-2 border-t ${dividerClass}`}>
            {hasParticipants ? (
              <div className="flex items-center min-w-0">
                {participants.slice(0, 4).map((m, i) => (
                  <div key={m.id} className={`rounded-full ring-2 ${onCover ? 'ring-white/90' : 'ring-card'}`} style={{ marginLeft: i === 0 ? 0 : '-0.5rem' }}>
                    <MemberAvatar member={m} size="xs" />
                  </div>
                ))}
                {participants.length > 4 && <span className={`text-[0.625rem] ml-1.5 ${subText}`}>+{participants.length - 4}</span>}
              </div>
            ) : (
              <span className={`text-xs italic ${subText}`}>No one joined yet</span>
            )}
            {hasAttachments && (
              <span className={`inline-flex items-center gap-1 text-[0.625rem] px-1.5 py-0.5 rounded-full ml-auto ${onCover ? 'bg-white/15 text-white' : 'bg-cream-pale text-ink-deep/50 border border-ink-charcoal/10'}`}>
                <Paperclip className="w-3 h-3" />{item.attachments.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}