import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, MapPin } from 'lucide-react';
import { Image } from '@/components/ui/image';
import AvatarStack from '@/components/tt/AvatarStack';
import { formatDateRange } from '@/lib/gatheringHelpers';

// Home gathering card — image with a dark scrim and the info overlaid on top,
// matching the Journey card treatment so the experience is consistent. The
// scrim is always dark (ink-scrim), so white text reads in both light and
// dark themes. Smaller than the old image+content card: the overlay removes
// the separate content block, so the whole card is the image area.
const STATUS_CLASSES = {
  terra: 'bg-terra/25 text-white border-white/25',
  green: 'bg-[#4a8b6f]/30 text-white border-white/25',
  muted: 'bg-white/15 text-white border-white/20',
};
const STATUS_DOT = { terra: 'bg-terra-coral', green: 'bg-[#7fd1a8]', muted: 'bg-white/70' };

export default function GatheringCard({ gathering, status, role, people, to }) {
  const g = gathering;
  return (
    <Link
      to={to}
      className="group relative block rounded-2xl overflow-hidden aspect-[16/10] border border-ink-charcoal/15 hover:-translate-y-1 transition-transform duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terra/40"
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
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.6875rem] font-semibold border ${STATUS_CLASSES[status.tone]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status.tone]}`} />
            {status.label}
          </span>
          {role && (
            <span className={`tt-stamp capitalize ${role === 'owner' ? 'bg-terra text-white border-terra' : 'bg-white/15 text-white border-white/25'}`}>
              {role}
            </span>
          )}
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-white leading-tight line-clamp-2">{g.name}</h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/85 mt-1.5">
            {g.start_date && (
              <span className="inline-flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" />{formatDateRange(g.start_date, g.end_date)}</span>
            )}
            {g.destinations?.length > 0 && (
              <span className="inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{g.destinations.slice(0, 2).join(', ')}</span>
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