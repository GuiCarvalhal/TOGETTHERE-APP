import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import AvatarStack from '@/components/tt/AvatarStack';
import { gatheringDestinations } from '@/lib/gatheringDates';

// Home gathering card — image with a dark scrim and the info overlaid on top,
// matching the Journey card treatment so the experience is consistent. The
// scrim is always dark (ink-scrim), so white text reads in both light and
// dark themes. The date label + range are DERIVED by the caller (Home) from
// the gathering's journey items and passed in as strings; the card is pure
// display. No status pill — the relative-time label is plain text.
export default function GatheringCard({ gathering, dateLabel, dateRange, role, people, to }) {
  const g = gathering;
  const destNames = gatheringDestinations(g).slice(0, 2).map((d) => d.name).join(', ');
  return (
    <Link
      to={to}
      className="group relative block rounded-2xl overflow-hidden h-[131.5px] border border-ink-charcoal/15 hover:-translate-y-1 transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
      style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.12)' }}
    >
      {g.cover_image ? (
        <Image src={g.cover_image} alt={g.name} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform duration-500" fittingType="fill" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim to-ink-soft flex items-center justify-center">
          <span className="font-display italic text-white/40 text-5xl">{g.name?.[0]}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-br from-ink-scrim/90 via-ink-scrim/55 to-ink-scrim/25" />
      <div className="relative h-full p-4 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          {dateLabel && <span className="text-white/90 text-xs font-semibold">{dateLabel}</span>}
          {role && (
            <span className={`tt-stamp capitalize ${role === 'owner' ? 'bg-terra text-white border-terra' : 'bg-white/15 text-white border-white/25'}`}>
              {role}
            </span>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-white leading-tight line-clamp-2">{g.name}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85 mt-1.5">
            {dateRange && (
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{dateRange}</span>
            )}
            {destNames && (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{destNames}</span>
            )}
          </div>
          <div className="flex items-center mt-2.5">
            <AvatarStack people={people} max={4} size="xs" />
          </div>
        </div>
      </div>
    </Link>
  );
}