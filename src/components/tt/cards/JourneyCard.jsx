import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, ChevronRight, Clock, CalendarDays, LogIn, LogOut } from 'lucide-react';
import { Image } from '@/components/ui/image';
import MemberAvatar from '@/components/tt/MemberAvatar';
import {
  formatTimeOnly, formatTimeWithCountry, formatDateTz, startLocation, endLocation,
  formatDuration, isAllDayItem, journeyMeta, tzAbbrAt,
} from '@/lib/formatPlaceTime';
import { useItemStartTz, useItemStartCountry, useItemEndTz, useItemEndCountry } from '@/lib/useItemPlace';
import { usePlacePhoto } from '@/lib/usePlacePhoto';
import { useFlightEnrichment } from '@/lib/useFlightEnrichment';

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Timeline journey segment row. The left rail column (icon medallion + primary
// time) is kept separate from the card and aligns to the vertical rail. Both
// the medallion and the time block carry a fully opaque page-surface background
// so the rail line never shows through them — clean segments between nodes.
//
// The card body starts with the metadata line (no item-type label — the rail
// icon conveys the type), then the title, then timing, then the actual
// participants of this item (attendee_user_ids, or the creator as a fallback,
// never all gathering members).
//
// Stays (hotel) render twice on the timeline via the `leg` prop: a check-in
// entry at the start and a check-out entry at the end — one underlying record.
//
// Card height is stable: identical content box whether Images is ON or OFF
// (same border + padding), and a reserved min-height participant slot so the
// height never depends on whether avatars are present.
export default function JourneyCard({ item, leg, typeColor, icon: Icon, participants, showImages, to, routeNumber }) {
  const navigate = useNavigate();
  const startTz = useItemStartTz(item);
  const endTz = useItemEndTz(item);
  const startCc = useItemStartCountry(item);
  const endCc = useItemEndCountry(item);
  const placePhoto = usePlacePhoto(item);
  const imageAtt = (item.attachments || []).find(isImg);
  const cover = showImages ? (imageAtt || placePhoto) : null;
  const onCover = !!cover;

  const isStayLeg = leg === 'check-in' || leg === 'check-out';
  // The primary instant for this card: the check-out leg shows the end time;
  // everything else shows the start time.
  const primaryIso = leg === 'check-out' ? item.end_datetime : item.start_datetime;
  const primaryTz = leg === 'check-out' ? endTz : startTz;

  const allDay = !isStayLeg && isAllDayItem(item, startTz);
  const startTime = allDay ? '' : formatTimeOnly(item.start_datetime, startTz);
  const endTime = (allDay || !item.end_datetime) ? '' : formatTimeOnly(item.end_datetime, endTz);
  const startFull = allDay ? '' : formatTimeWithCountry(item.start_datetime, startTz, startCc);
  const endFull = (allDay || !item.end_datetime) ? '' : formatTimeWithCountry(item.end_datetime, endTz, endCc);
  const duration = (!allDay && !isStayLeg && item.start_datetime && item.end_datetime) ? formatDuration(item.start_datetime, item.end_datetime) : '';
  const { fromCity, toCity, airline: enrichedAirline } = useFlightEnrichment(item);
  const meta = journeyMeta(item, enrichedAirline);
  // Flight-only content for the four card rows (geometry unchanged):
  //  row1 meta  = number · airline · '8h 30m duration' (duration kept here, not
  //              duplicated in the timing row);
  //  row2 title = 'Origin City - CC → Destination City - CC' using the real city
  //              from Google address components (never the airport name/IATA),
  //              falling back to just the country code for legacy rows.
  const isFlight = item.type === 'flight';
  const flightDur = (isFlight && !allDay && !isStayLeg && item.start_datetime && item.end_datetime) ? formatDuration(item.start_datetime, item.end_datetime) : '';
  const metaLine = isFlight ? [meta, flightDur && `${flightDur} duration`].filter(Boolean).join(' · ') : meta;
  const fromCc = item.from_place?.country || startCc || '';
  const toCc = item.to_place?.country || endCc || '';
  const fromLabel = [fromCity, fromCc].filter(Boolean).join(' - ');
  const toLabel = [toCity, toCc].filter(Boolean).join(' - ');
  const flightRoute = (fromLabel || toLabel) ? `${fromLabel} > ${toLabel}` : '';

  // Rail time block uses the primary instant's wall clock + abbreviation.
  const railTime = leg === 'check-out' ? endTime : startTime;
  const railAbbr = primaryIso ? tzAbbrAt(primaryIso, primaryTz) : '';

  const open = () => { if (to) navigate(to); };

  const mainText = onCover ? 'text-white' : 'text-ink-deep';
  const subText = onCover ? 'text-white/85' : 'text-ink-deep/55';
  const metaText = onCover ? 'text-white/80' : 'text-ink-deep/50';
  const legBadgeBase = onCover ? 'bg-white/20 text-white' : 'bg-terra/12 text-terra-deep';

  const hasAttachments = (item.attachments || []).length > 0;

  return (
    <div
      className="flex gap-2 items-stretch cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      role="link"
      tabIndex={to ? 0 : undefined}
      onClick={open}
      onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
    >
      {/* Left rail column: icon medallion + primary time. Opaque page-surface
          backgrounds so the rail line never shows through them. */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center relative z-10 ring-2 ring-background shadow-sm"
          style={{ backgroundColor: typeColor }}
        >
          <Icon className="w-5 h-5 text-white" strokeWidth={2} />
        </div>
        {allDay ? (
          <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded relative z-10">
            <p className="text-[0.625rem] font-bold text-foreground/70 whitespace-nowrap">All day</p>
          </div>
        ) : railTime ? (
          <div className="mt-1.5 text-center leading-tight bg-background px-1.5 rounded relative z-10">
            <p className="text-xs font-bold text-foreground whitespace-nowrap">{railTime}</p>
            {railAbbr && <p className="text-[0.625rem] text-foreground/45 mt-0.5">{railAbbr}</p>}
          </div>
        ) : null}
        {routeNumber != null && (
          <span className="mt-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full border border-terra/35 bg-background text-terra-deep text-[0.625rem] font-bold relative z-10">
            {routeNumber}
          </span>
        )}
      </div>

      {/* Card — identical content box whether Images is ON or OFF (same border,
          same padding, same reserved participant slot) so toggling is a skin
          change, not a relayout. */}
      <div className={`flex-1 min-w-0 rounded-2xl overflow-hidden relative border ${onCover ? 'border-transparent' : 'border-ink-charcoal/15 bg-card'}`} style={!onCover ? { boxShadow: '0 10px 30px rgba(0,0,0,0.12)' } : undefined}>
        {onCover && (
          <>
            <Image src={cover} alt="" className="absolute inset-0 w-full h-full" fittingType="fill" />
            <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/60 to-ink-scrim/35" />
          </>
        )}
        <div className="relative p-3 flex flex-col">
          <ChevronRight className="absolute top-3 right-3 w-4 h-4 shrink-0" style={{ color: onCover ? 'rgba(255,255,255,0.75)' : undefined }} />

          {/* Metadata line — the first line of the card (no item-type label) */}
          {metaLine && <p className={`text-[0.6875rem] truncate pr-5 ${metaText}`}>{metaLine}</p>}

          <h3 className={`font-display text-[0.95rem] font-bold leading-tight mt-0.5 line-clamp-2 pr-5 ${mainText}`}>{isFlight ? <span className="block truncate">{flightRoute || item.title}</span> : item.title}</h3>

          {/* Timing: stay legs show a Check-in/Check-out pill + the single
              primary time; other items show start → end · duration. */}
          <div className={`flex items-center gap-1.5 mt-1 text-xs flex-wrap ${subText}`}>
            {isStayLeg ? (
              <>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold ${legBadgeBase}`}>
                  {leg === 'check-in' ? <LogIn className="w-3 h-3" /> : <LogOut className="w-3 h-3" />}
                  {leg === 'check-in' ? 'Check-in' : 'Check-out'}
                </span>
                {(leg === 'check-out' ? endFull : startFull) && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{leg === 'check-out' ? endFull : startFull}</span>}
              </>
            ) : allDay ? (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {formatDateTz(item.start_datetime, startTz) ? `${formatDateTz(item.start_datetime, startTz)} · All day` : 'All day'}
              </span>
            ) : (
              <>
                {startFull && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{startFull}</span>}
                {endFull && <><span className="opacity-50">→</span><span>{endFull}</span></>}
                {duration && (
                  <span aria-hidden={isFlight ? 'true' : undefined} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[0.625rem] font-semibold border ${isFlight ? 'invisible' : ''} ${onCover ? 'border-transparent bg-white/20 text-white' : 'border-ink-charcoal/10 bg-cream-pale text-ink-deep/60'}`}>
                    {duration}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Reserved participant slot (fixed min-height) so card height never
              depends on whether avatars are present. Shows only the actual
              participants of this item; "No one joined yet" honest fallback. */}
          <div className="flex items-center gap-2 mt-2 min-h-[2.5rem]">
            {participants?.length > 0 ? (
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
              <span className={`inline-flex items-center gap-1 text-[0.625rem] px-1.5 py-0.5 rounded-full ml-auto border ${onCover ? 'border-transparent bg-white/15 text-white' : 'border-ink-charcoal/10 bg-cream-pale text-ink-deep/50'}`}>
                <Paperclip className="w-3 h-3" />{item.attachments.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}