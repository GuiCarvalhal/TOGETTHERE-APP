import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Paperclip, ChevronRight } from 'lucide-react';
import { Image } from '@/components/ui/image';
import MemberAvatar from '@/components/tt/MemberAvatar';
import { formatTimeTz, startLocation } from '@/lib/formatPlaceTime';
import { usePlaceTimezone } from '@/lib/usePlaceTimezone';
import { usePlacePhoto } from '@/lib/usePlacePhoto';

const isImg = (u) => /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u || '');

// Timeline journey segment row. The left column (type icon + start time with
// tz abbreviation) aligns to the vertical timeline rail; the compact card sits
// to the right. Every type shares this one skeleton. Tapping anywhere on the
// row opens Journey Detail — no owner names, no inline edit/delete on the card
// (those actions live on the detail page). The cached Google Places photo is
// shown only as a small subordinate thumbnail when the images toggle is on.
export default function JourneyCard({ item, typeLabel, typeColor, icon: Icon, participants, showImages, to }) {
  const navigate = useNavigate();
  const startTz = usePlaceTimezone(startLocation(item));
  const placePhoto = usePlacePhoto(item);
  const imageAtt = showImages ? (item.attachments || []).find(isImg) : null;
  const thumb = showImages ? (imageAtt || placePhoto) : null;

  // Split "1:30 PM (CEST)" into the wall-clock time and the tz abbreviation so
  // they can stack in the narrow rail column. Always the place's local tz.
  const fullTime = formatTimeTz(item.start_datetime, startTz);
  const timePart = fullTime ? fullTime.split(' (')[0] : '';
  const abbr = (fullTime.match(/\(([^)]+)\)/) || [])[1] || '';

  // One concise subtitle line: route for transport types, place name otherwise.
  const hasRoute = !!(item.location_from || item.location_to);
  const route = hasRoute
    ? `${item.location_from || ''}${item.location_from && item.location_to ? ' → ' : ''}${item.location_to || ''}`
    : '';
  const subtitle = route || item.location_name || '';

  const open = () => { if (to) navigate(to); };

  return (
    <div
      className="flex gap-2 items-stretch cursor-pointer rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      role="link"
      tabIndex={to ? 0 : undefined}
      onClick={open}
      onKeyDown={to ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } : undefined}
    >
      {/* Left rail column: type icon + start time with tz abbreviation */}
      <div className="w-12 shrink-0 flex flex-col items-center pt-2.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10 border-2 border-background"
          style={{ background: `${typeColor}1A`, color: typeColor }}
        >
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {timePart && (
          <div className="mt-1.5 text-center leading-tight">
            <p className="text-xs font-bold text-ink-deep whitespace-nowrap">{timePart}</p>
            {abbr && <p className="text-[0.625rem] text-ink-deep/45 mt-0.5">{abbr}</p>}
          </div>
        )}
      </div>

      {/* Right: compact card */}
      <div className="flex-1 min-w-0 tt-card p-3">
        <div className="flex items-start gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="tt-label whitespace-nowrap" style={{ color: typeColor }}>{typeLabel}</span>
              {item.confirmation_number && <span className="text-[0.625rem] text-ink-deep/40 truncate">#{item.confirmation_number}</span>}
              <ChevronRight className="w-4 h-4 text-ink-deep/25 ml-auto shrink-0" />
            </div>
            <h3 className="font-display text-[0.95rem] font-bold text-ink-deep leading-tight mt-0.5 line-clamp-2">{item.title}</h3>
            {subtitle && (
              <p className="text-xs text-ink-deep/55 mt-1 flex items-center gap-1 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="truncate">{subtitle}</span>
              </p>
            )}
          </div>
          {thumb && (
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 border border-ink-charcoal/10">
              <Image src={thumb} alt="" className="w-full h-full object-cover" fittingType="fill" />
            </div>
          )}
        </div>
        {(participants?.length > 0 || (item.attachments || []).length > 0) && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink-charcoal/10">
            {participants?.length > 0 && (
              <div className="flex items-center min-w-0">
                {participants.slice(0, 4).map((m, i) => (
                  <div key={m.id} className="rounded-full ring-2 ring-card" style={{ marginLeft: i === 0 ? 0 : '-0.5rem' }}>
                    <MemberAvatar member={m} size="xs" />
                  </div>
                ))}
                {participants.length > 4 && <span className="text-[0.625rem] text-ink-deep/50 ml-1.5">+{participants.length - 4}</span>}
              </div>
            )}
            {(item.attachments || []).length > 0 && (
              <span className="inline-flex items-center gap-1 text-[0.625rem] text-ink-deep/50 px-1.5 py-0.5 rounded-full bg-cream-pale border border-ink-charcoal/10">
                <Paperclip className="w-3 h-3" />{(item.attachments || []).length}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}